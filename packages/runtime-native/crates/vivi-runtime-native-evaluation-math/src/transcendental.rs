use fpmath::SoftF64;

use crate::binary64::DetF64;

impl DetF64 {
    /// Computes sine through the pinned `SoftF64` raw-bit path.
    #[inline]
    pub(crate) fn sin(self) -> Self {
        let result = fpmath::sin(SoftF64::from_bits(self.to_bits()));
        Self::from_bits(result.to_bits())
    }

    /// Computes cosine through the pinned `SoftF64` raw-bit path.
    #[inline]
    pub(crate) fn cos(self) -> Self {
        let result = fpmath::cos(SoftF64::from_bits(self.to_bits()));
        Self::from_bits(result.to_bits())
    }

    /// Computes `atan2(y, x)` through the pinned `SoftF64` raw-bit path.
    #[inline]
    pub(crate) fn atan2(self, x: Self) -> Self {
        let y = SoftF64::from_bits(self.to_bits());
        let x = SoftF64::from_bits(x.to_bits());
        Self::from_bits(fpmath::atan2(y, x).to_bits())
    }

    /// Computes arccosine through the pinned `SoftF64` raw-bit path.
    #[inline]
    pub(crate) fn acos(self) -> Self {
        let result = fpmath::acos(SoftF64::from_bits(self.to_bits()));
        Self::from_bits(result.to_bits())
    }

    /// Computes square root through the pinned `SoftF64` raw-bit path.
    #[inline]
    pub(crate) fn sqrt(self) -> Self {
        let result = fpmath::sqrt(SoftF64::from_bits(self.to_bits()));
        Self::from_bits(result.to_bits())
    }
}
