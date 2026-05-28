use serde_json::{Map, Value};

use crate::errors::RuntimeError;
use crate::limits::RuntimeLimits;
use crate::parser::RuntimePayload;
use crate::status;

/// Runtime parameter metadata.
#[derive(Clone, Debug, PartialEq)]
pub struct ParameterInfo {
    /// Parameter ID.
    pub id: String,
    /// Minimum value.
    pub min: f64,
    /// Maximum value.
    pub max: f64,
    /// Default value.
    pub default_value: f64,
    /// Current value.
    pub current_value: f64,
}

/// Scalar runtime parameter state.
#[derive(Clone, Debug, PartialEq)]
pub struct ParameterState {
    parameters: Vec<ParameterInfo>,
}

impl ParameterState {
    /// Extract parameter definitions from a parsed payload.
    pub fn from_payload(payload: &RuntimePayload) -> Result<Self, RuntimeError> {
        Self::from_payload_with_limits(payload, RuntimeLimits::default())
    }

    /// Extract parameter definitions from a parsed payload with runtime limits.
    pub fn from_payload_with_limits(
        payload: &RuntimePayload,
        limits: RuntimeLimits,
    ) -> Result<Self, RuntimeError> {
        let limits = limits.hardened();
        let root = object(&payload.value, "runtime payload")?;
        let project = object_field(root, "project", "project")?;
        let parameters = match project.get("parameters") {
            Some(value) => array(value, "project.parameters")?,
            None => &[],
        };
        if parameters.len() > limits.max_parameters {
            return Err(RuntimeError::new(
                status::LIMIT_EXCEEDED,
                format!(
                    "parameters exceeds runtime limit: {} > {}",
                    parameters.len(),
                    limits.max_parameters
                ),
            ));
        }
        let mut result = Vec::with_capacity(parameters.len());
        for (index, parameter) in parameters.iter().enumerate() {
            let path = format!("project.parameters[{index}]");
            let parameter = object(parameter, &path)?;
            let id = string_field(parameter, "id", &format!("{path}.id"))?.to_owned();
            let min = f64_field(parameter, "minValue", &format!("{path}.minValue"))?;
            let max = f64_field(parameter, "maxValue", &format!("{path}.maxValue"))?;
            let default_value =
                f64_field(parameter, "defaultValue", &format!("{path}.defaultValue"))?;
            if min > max || default_value < min || default_value > max {
                return Err(RuntimeError::new(
                    status::VALIDATION,
                    format!("{path} has invalid min/max/default values"),
                ));
            }
            if result
                .iter()
                .any(|existing: &ParameterInfo| existing.id == id)
            {
                return Err(RuntimeError::new(
                    status::VALIDATION,
                    format!("duplicate runtime parameter: {id}"),
                ));
            }
            result.push(ParameterInfo {
                id,
                min,
                max,
                default_value,
                current_value: default_value,
            });
        }
        Ok(Self { parameters: result })
    }

    /// Return parameter metadata and current values.
    pub fn parameters(&self) -> &[ParameterInfo] {
        &self.parameters
    }

    /// Set and clamp a known parameter value.
    pub fn set_input(&mut self, id: &str, value: f64) -> Result<(), RuntimeError> {
        if !value.is_finite() {
            return Err(RuntimeError::new(
                status::INVALID_ARGUMENT,
                "input value must be finite",
            ));
        }
        let Some(parameter) = self
            .parameters
            .iter_mut()
            .find(|parameter| parameter.id == id)
        else {
            return Err(RuntimeError::new(
                status::INVALID_ARGUMENT,
                format!("unknown runtime input: {id}"),
            ));
        };
        parameter.current_value = value.clamp(parameter.min, parameter.max);
        Ok(())
    }

    /// Get a known parameter value.
    pub fn get_input(&self, id: &str) -> Result<f64, RuntimeError> {
        self.parameters
            .iter()
            .find(|parameter| parameter.id == id)
            .map(|parameter| parameter.current_value)
            .ok_or_else(|| {
                RuntimeError::new(
                    status::INVALID_ARGUMENT,
                    format!("unknown runtime input: {id}"),
                )
            })
    }
}

fn object<'a>(value: &'a Value, path: &str) -> Result<&'a Map<String, Value>, RuntimeError> {
    value
        .as_object()
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, format!("{path} must be an object")))
}

fn object_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a Map<String, Value>, RuntimeError> {
    object
        .get(key)
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, format!("{path} is required")))
        .and_then(|value| self::object(value, path))
}

fn array<'a>(value: &'a Value, path: &str) -> Result<&'a [Value], RuntimeError> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, format!("{path} must be an array")))
}

fn string_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a str, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, format!("{path} must be a string")))
}

fn f64_field(object: &Map<String, Value>, key: &str, path: &str) -> Result<f64, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, format!("{path} must be finite")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RuntimeLimits, parse_runtime_payload};

    #[test]
    fn extracts_and_clamps_parameters() {
        let payload = br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"parameters":[{"id":"vivi.head.yaw","name":"Head Yaw","minValue":-1,"maxValue":1,"defaultValue":0}]},"atlases":[]}"#;
        let payload = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap();
        let mut state = ParameterState::from_payload(&payload).unwrap();
        assert_eq!(state.parameters().len(), 1);
        assert_eq!(state.get_input("vivi.head.yaw").unwrap(), 0.0);
        state.set_input("vivi.head.yaw", 2.0).unwrap();
        assert_eq!(state.get_input("vivi.head.yaw").unwrap(), 1.0);
    }

    #[test]
    fn rejects_invalid_parameter_values() {
        let payload = br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"parameters":[{"id":"x","name":"X","minValue":1,"maxValue":-1,"defaultValue":0}]},"atlases":[]}"#;
        let payload = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap();
        let error = ParameterState::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::VALIDATION);
    }

    #[test]
    fn rejects_non_array_parameters_field() {
        let payload = br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"parameters":"broken"},"atlases":[]}"#;
        let payload = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap();
        let error = ParameterState::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::VALIDATION);
    }

    #[test]
    fn enforces_parameter_limit() {
        let payload = br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"parameters":[{"id":"x","name":"X","minValue":-1,"maxValue":1,"defaultValue":0}]},"atlases":[]}"#;
        let payload = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap();
        let error = ParameterState::from_payload_with_limits(
            &payload,
            RuntimeLimits {
                max_parameters: 0,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(error.status(), status::LIMIT_EXCEEDED);
    }
}
