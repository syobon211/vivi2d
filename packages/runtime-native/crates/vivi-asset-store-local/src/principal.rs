use sha2::{Digest as _, Sha256};
use vivi_asset_resolver::PrincipalId;

use crate::error::{LocalStoreError, invalid_input};

const PRINCIPAL_KEY_DOMAIN: &[u8] = b"vivi2d.local-asset-store.principal.v1\0";

pub(crate) fn principal_key(principal: &PrincipalId) -> Result<[u8; 32], LocalStoreError> {
    if principal.as_bytes().is_empty() || principal.as_bytes().len() > 4_096 {
        return Err(invalid_input());
    }
    let length = u64::try_from(principal.as_bytes().len()).map_err(|_| invalid_input())?;
    let mut hasher = Sha256::new();
    hasher.update(PRINCIPAL_KEY_DOMAIN);
    hasher.update(length.to_be_bytes());
    hasher.update(principal.as_bytes());
    Ok(hasher.finalize().into())
}
