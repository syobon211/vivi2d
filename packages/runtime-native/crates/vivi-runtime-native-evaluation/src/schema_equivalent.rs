//! Schema 2020-12 equivalent evaluator for every validation keyword used by
//! the approved Evaluation Payload v1 schema.

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::sync::OnceLock;

use serde_json::{Map, Value};

use crate::{APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES, EvaluationPayloadError};

static APPROVED_SCHEMA: OnceLock<Result<Value, ()>> = OnceLock::new();

pub(crate) fn validate(instance: &Value) -> Result<(), EvaluationPayloadError> {
    let schema = APPROVED_SCHEMA
        .get_or_init(|| {
            serde_json::from_slice(APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES).map_err(|_| ())
        })
        .as_ref()
        .map_err(|()| EvaluationPayloadError::internal())?;
    if validate_schema(schema, instance, schema)? {
        Ok(())
    } else {
        Err(EvaluationPayloadError::payload())
    }
}

fn validate_schema(
    schema: &Value,
    instance: &Value,
    root: &Value,
) -> Result<bool, EvaluationPayloadError> {
    let Some(schema_object) = schema.as_object() else {
        return match schema.as_bool() {
            Some(value) => Ok(value),
            None => Err(EvaluationPayloadError::internal()),
        };
    };

    if let Some(reference) = schema_object.get("$ref") {
        let reference = reference
            .as_str()
            .ok_or_else(EvaluationPayloadError::internal)?;
        let target = resolve_local_reference(root, reference)?;
        if !validate_schema(target, instance, root)? {
            return Ok(false);
        }
    }

    if let Some(expected_type) = schema_object.get("type")
        && !type_matches(expected_type, instance)?
    {
        return Ok(false);
    }

    if let Some(expected) = schema_object.get("const")
        && !json_equal(expected, instance)
    {
        return Ok(false);
    }
    if let Some(values) = schema_object.get("enum") {
        let values = values
            .as_array()
            .ok_or_else(EvaluationPayloadError::internal)?;
        if !values.iter().any(|expected| json_equal(expected, instance)) {
            return Ok(false);
        }
    }

    if let Some(branches) = schema_object.get("anyOf") {
        let branches = branches
            .as_array()
            .ok_or_else(EvaluationPayloadError::internal)?;
        let mut matched = false;
        for branch in branches {
            if validate_schema(branch, instance, root)? {
                matched = true;
                break;
            }
        }
        if !matched {
            return Ok(false);
        }
    }
    if let Some(branches) = schema_object.get("oneOf") {
        let branches = branches
            .as_array()
            .ok_or_else(EvaluationPayloadError::internal)?;
        let mut matches = 0_usize;
        for branch in branches {
            if validate_schema(branch, instance, root)? {
                matches = matches
                    .checked_add(1)
                    .ok_or_else(EvaluationPayloadError::limit)?;
            }
        }
        if matches != 1 {
            return Ok(false);
        }
    }
    if let Some(negated) = schema_object.get("not")
        && validate_schema(negated, instance, root)?
    {
        return Ok(false);
    }

    if let Some(pattern) = schema_object.get("pattern")
        && let Some(value) = instance.as_str()
    {
        let pattern = pattern
            .as_str()
            .ok_or_else(EvaluationPayloadError::internal)?;
        if !matches_pattern(value, pattern)? {
            return Ok(false);
        }
    }

    if let Some(number) = instance.as_f64() {
        if let Some(minimum) = schema_object.get("minimum")
            && number < schema_number(minimum)?
        {
            return Ok(false);
        }
        if let Some(maximum) = schema_object.get("maximum")
            && number > schema_number(maximum)?
        {
            return Ok(false);
        }
        if let Some(minimum) = schema_object.get("exclusiveMinimum")
            && number <= schema_number(minimum)?
        {
            return Ok(false);
        }
    }

    if let Some(array) = instance.as_array() {
        if let Some(minimum) = schema_object.get("minItems")
            && array.len() < schema_usize(minimum)?
        {
            return Ok(false);
        }
        if let Some(maximum) = schema_object.get("maxItems")
            && array.len() > schema_usize(maximum)?
        {
            return Ok(false);
        }
        if schema_object
            .get("uniqueItems")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            && !array_items_are_unique(array)?
        {
            return Ok(false);
        }

        let prefix = schema_object.get("prefixItems").map(|value| {
            value
                .as_array()
                .ok_or_else(EvaluationPayloadError::internal)
        });
        let prefix: &[Value] = match prefix {
            Some(value) => value?.as_slice(),
            None => &[],
        };
        for (item, item_schema) in array.iter().zip(prefix) {
            if !validate_schema(item_schema, item, root)? {
                return Ok(false);
            }
        }
        if let Some(items) = schema_object.get("items") {
            for item in array.iter().skip(prefix.len()) {
                if !validate_schema(items, item, root)? {
                    return Ok(false);
                }
            }
        }

        if let Some(contains) = schema_object.get("contains") {
            let minimum = schema_object
                .get("minContains")
                .map(schema_usize)
                .transpose()?
                .unwrap_or(1);
            let mut matches = 0_usize;
            for item in array {
                if validate_schema(contains, item, root)? {
                    matches = matches
                        .checked_add(1)
                        .ok_or_else(EvaluationPayloadError::limit)?;
                }
            }
            if matches < minimum {
                return Ok(false);
            }
        }

        // `x-vivi-uniqueBy` is an annotation, not a Schema 2020-12 keyword.
        // The versioned semantic validator enforces every approved occurrence
        // only after this generic Stage 1 succeeds.
    }

    if let Some(object) = instance.as_object()
        && !validate_object_keywords(schema_object, object, root)?
    {
        return Ok(false);
    }

    Ok(true)
}

fn validate_object_keywords(
    schema: &Map<String, Value>,
    instance: &Map<String, Value>,
    root: &Value,
) -> Result<bool, EvaluationPayloadError> {
    if let Some(required) = schema.get("required") {
        let required = required
            .as_array()
            .ok_or_else(EvaluationPayloadError::internal)?;
        for property in required {
            let property = property
                .as_str()
                .ok_or_else(EvaluationPayloadError::internal)?;
            if !instance.contains_key(property) {
                return Ok(false);
            }
        }
    }

    let properties = schema.get("properties").map(|value| {
        value
            .as_object()
            .ok_or_else(EvaluationPayloadError::internal)
    });
    let properties = match properties {
        Some(value) => Some(value?),
        None => None,
    };
    if let Some(properties) = properties {
        for (name, property_schema) in properties {
            if let Some(value) = instance.get(name)
                && !validate_schema(property_schema, value, root)?
            {
                return Ok(false);
            }
        }
    }

    let patterns = schema.get("patternProperties").map(|value| {
        value
            .as_object()
            .ok_or_else(EvaluationPayloadError::internal)
    });
    let patterns = match patterns {
        Some(value) => Some(value?),
        None => None,
    };
    for (name, value) in instance {
        let named = properties.is_some_and(|known| known.contains_key(name));
        let mut pattern_matched = false;
        if let Some(patterns) = patterns {
            for (pattern, pattern_schema) in patterns {
                if matches_pattern(name, pattern)? {
                    pattern_matched = true;
                    if !validate_schema(pattern_schema, value, root)? {
                        return Ok(false);
                    }
                }
            }
        }
        if named || pattern_matched {
            continue;
        }
        if let Some(additional) = schema.get("additionalProperties")
            && !validate_schema(additional, value, root)?
        {
            return Ok(false);
        }
    }
    Ok(true)
}

fn resolve_local_reference<'a>(
    root: &'a Value,
    reference: &str,
) -> Result<&'a Value, EvaluationPayloadError> {
    let pointer = reference
        .strip_prefix('#')
        .ok_or_else(EvaluationPayloadError::internal)?;
    root.pointer(pointer)
        .ok_or_else(EvaluationPayloadError::internal)
}

fn type_matches(expected: &Value, instance: &Value) -> Result<bool, EvaluationPayloadError> {
    if let Some(expected) = expected.as_str() {
        return type_name_matches(expected, instance);
    }
    let choices = expected
        .as_array()
        .ok_or_else(EvaluationPayloadError::internal)?;
    for choice in choices {
        let choice = choice
            .as_str()
            .ok_or_else(EvaluationPayloadError::internal)?;
        if type_name_matches(choice, instance)? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn type_name_matches(expected: &str, instance: &Value) -> Result<bool, EvaluationPayloadError> {
    match expected {
        "null" => Ok(instance.is_null()),
        "boolean" => Ok(instance.is_boolean()),
        "number" => Ok(instance.is_number()),
        "integer" => Ok(instance.as_f64().is_some_and(|value| value.fract() == 0.0)),
        "string" => Ok(instance.is_string()),
        "array" => Ok(instance.is_array()),
        "object" => Ok(instance.is_object()),
        _ => Err(EvaluationPayloadError::internal()),
    }
}

fn schema_number(value: &Value) -> Result<f64, EvaluationPayloadError> {
    value.as_f64().ok_or_else(EvaluationPayloadError::internal)
}

fn schema_usize(value: &Value) -> Result<usize, EvaluationPayloadError> {
    value
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(EvaluationPayloadError::internal)
}

fn matches_pattern(value: &str, pattern: &str) -> Result<bool, EvaluationPayloadError> {
    let (allowed, maximum) = match pattern {
        "^[A-Za-z0-9_-]{1,128}$" => (PatternAlphabet::Simple, 128),
        "^[A-Za-z0-9_-]{1,120}$" => (PatternAlphabet::Simple, 120),
        "^[A-Za-z0-9_.-]{1,128}$" => (PatternAlphabet::Parameter, 128),
        _ => return Err(EvaluationPayloadError::internal()),
    };
    let length = value.len();
    Ok(length >= 1
        && length <= maximum
        && value.bytes().all(|byte| match allowed {
            PatternAlphabet::Simple => byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'),
            PatternAlphabet::Parameter => {
                byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.')
            }
        }))
}

#[derive(Clone, Copy)]
enum PatternAlphabet {
    Simple,
    Parameter,
}

fn array_items_are_unique(values: &[Value]) -> Result<bool, EvaluationPayloadError> {
    let mut seen = HashSet::new();
    seen.try_reserve(values.len())
        .map_err(|_| EvaluationPayloadError::limit())?;
    for value in values {
        if !seen.insert(JsonKey(value)) {
            return Ok(false);
        }
    }
    Ok(true)
}

#[derive(Clone, Copy)]
struct JsonKey<'a>(&'a Value);

impl PartialEq for JsonKey<'_> {
    fn eq(&self, other: &Self) -> bool {
        json_equal(self.0, other.0)
    }
}

impl Eq for JsonKey<'_> {}

impl Hash for JsonKey<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        hash_json(self.0, state);
    }
}

fn json_equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(left), Value::Bool(right)) => left == right,
        (Value::Number(left), Value::Number(right)) => left.as_f64() == right.as_f64(),
        (Value::String(left), Value::String(right)) => left == right,
        (Value::Array(left), Value::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right)
                    .all(|(left, right)| json_equal(left, right))
        }
        (Value::Object(left), Value::Object(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .all(|(key, left)| right.get(key).is_some_and(|right| json_equal(left, right)))
        }
        _ => false,
    }
}

fn hash_json<H: Hasher>(value: &Value, state: &mut H) {
    match value {
        Value::Null => 0_u8.hash(state),
        Value::Bool(value) => {
            1_u8.hash(state);
            value.hash(state);
        }
        Value::Number(value) => {
            2_u8.hash(state);
            let value = value.as_f64().unwrap_or(f64::NAN);
            let canonical = if value == 0.0 { 0.0 } else { value };
            canonical.to_bits().hash(state);
        }
        Value::String(value) => {
            3_u8.hash(state);
            value.hash(state);
        }
        Value::Array(values) => {
            4_u8.hash(state);
            values.len().hash(state);
            for value in values {
                hash_json(value, state);
            }
        }
        Value::Object(values) => {
            5_u8.hash(state);
            values.len().hash(state);
            for (key, value) in values {
                key.hash(state);
                hash_json(value, state);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use serde_json::{Number, Value};

    use super::JsonKey;

    #[test]
    fn json_schema_unique_equality_hashes_negative_and_positive_zero_identically() {
        let positive = Value::Number(Number::from_f64(0.0).expect("finite"));
        let negative = Value::Number(Number::from_f64(-0.0).expect("finite"));
        let mut values = HashSet::new();
        assert!(values.insert(JsonKey(&positive)));
        assert!(!values.insert(JsonKey(&negative)));
    }
}
