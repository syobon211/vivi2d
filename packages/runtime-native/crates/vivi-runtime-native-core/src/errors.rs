use std::error::Error;
use std::fmt::{Display, Formatter};

use crate::status;

/// Canonical native runtime error.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeError {
    status: i32,
    message: String,
}

impl RuntimeError {
    /// Create a new runtime error with a C ABI-compatible status code.
    pub fn new(status: i32, message: impl Into<String>) -> Self {
        Self {
            status: if status::is_canonical(status) {
                status
            } else {
                status::INTERNAL
            },
            message: message.into(),
        }
    }

    /// Return the canonical status code.
    pub fn status(&self) -> i32 {
        self.status
    }

    /// Return the diagnostic message.
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl Display for RuntimeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for RuntimeError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::status;

    #[test]
    fn coerces_out_of_catalog_status_to_internal() {
        let error = RuntimeError::new(99, "unexpected status");
        assert_eq!(error.status(), status::INTERNAL);
        assert_eq!(error.message(), "unexpected status");
    }
}
