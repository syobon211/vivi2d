use rustc_apfloat::{Round, ieee::Double};

const SIGN_MASK: u64 = 0x8000_0000_0000_0000;
const EXPONENT_MASK: u64 = 0x7ff0_0000_0000_0000;
const FRACTION_MASK: u64 = 0x000f_ffff_ffff_ffff;
const CANONICAL_NAN_BITS: u64 = 0x7ff8_0000_0000_0000;

/// One canonicalized IEEE-754 binary64 interchange value held as raw bits.
///
/// No host floating-point value is created by this type.
#[derive(Clone, Copy)]
pub(crate) struct DetF64(u64);

/// The five binary64 classes frozen by the deterministic-math vectors.
#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum DetF64Class {
    /// Either sign of zero.
    Zero,
    /// A finite nonzero value with an all-zero exponent field.
    Subnormal,
    /// A finite value with a nonzero, non-all-ones exponent field.
    Normal,
    /// Either sign of infinity.
    Infinite,
    /// The canonical quiet NaN.
    Nan,
}

impl DetF64 {
    /// Constructs a raw binary64 value, canonicalizing every NaN encoding.
    #[inline]
    pub(crate) const fn from_bits(bits: u64) -> Self {
        Self(canonicalize_nan(bits))
    }

    /// Returns the canonical raw binary64 interchange bits.
    #[inline]
    pub(crate) const fn to_bits(self) -> u64 {
        self.0
    }

    /// Classifies the raw binary64 value without using a host float.
    #[inline]
    pub(crate) const fn classify(self) -> DetF64Class {
        let exponent = self.0 & EXPONENT_MASK;
        let fraction = self.0 & FRACTION_MASK;
        if exponent == 0 {
            if fraction == 0 {
                DetF64Class::Zero
            } else {
                DetF64Class::Subnormal
            }
        } else if exponent != EXPONENT_MASK {
            DetF64Class::Normal
        } else if fraction == 0 {
            DetF64Class::Infinite
        } else {
            DetF64Class::Nan
        }
    }

    /// Reports whether the raw value is neither infinity nor NaN.
    #[inline]
    pub(crate) const fn is_finite(self) -> bool {
        self.0 & EXPONENT_MASK != EXPONENT_MASK
    }

    /// Adds two values using APFloat round-to-nearest, ties-to-even.
    #[inline]
    pub(crate) fn add(self, rhs: Self) -> Self {
        let result = rustc_apfloat::Float::add_r(
            self.as_apfloat(),
            rhs.as_apfloat(),
            Round::NearestTiesToEven,
        );
        Self::from_apfloat(result.value)
    }

    /// Subtracts two values using APFloat round-to-nearest, ties-to-even.
    #[inline]
    pub(crate) fn sub(self, rhs: Self) -> Self {
        let result = rustc_apfloat::Float::sub_r(
            self.as_apfloat(),
            rhs.as_apfloat(),
            Round::NearestTiesToEven,
        );
        Self::from_apfloat(result.value)
    }

    /// Multiplies two values using APFloat round-to-nearest, ties-to-even.
    #[inline]
    pub(crate) fn mul(self, rhs: Self) -> Self {
        let result = rustc_apfloat::Float::mul_r(
            self.as_apfloat(),
            rhs.as_apfloat(),
            Round::NearestTiesToEven,
        );
        Self::from_apfloat(result.value)
    }

    /// Divides two values using APFloat round-to-nearest, ties-to-even.
    #[inline]
    pub(crate) fn div(self, rhs: Self) -> Self {
        let result = rustc_apfloat::Float::div_r(
            self.as_apfloat(),
            rhs.as_apfloat(),
            Round::NearestTiesToEven,
        );
        Self::from_apfloat(result.value)
    }

    /// Computes C `fmod` semantics through APFloat.
    #[inline]
    pub(crate) fn c_fmod(self, rhs: Self) -> Self {
        let result = rustc_apfloat::Float::c_fmod(self.as_apfloat(), rhs.as_apfloat());
        Self::from_apfloat(result.value)
    }

    /// Flips the sign bit exactly, then restores the canonical NaN invariant.
    #[inline]
    pub(crate) const fn neg(self) -> Self {
        Self::from_bits(self.0 ^ SIGN_MASK)
    }

    /// Clears the sign bit exactly, then restores the canonical NaN invariant.
    #[inline]
    pub(crate) const fn abs(self) -> Self {
        Self::from_bits(self.0 & !SIGN_MASK)
    }

    /// Performs IEEE quiet equality using APFloat.
    #[inline]
    pub(crate) fn eq(self, rhs: Self) -> bool {
        self.as_apfloat() == rhs.as_apfloat()
    }

    /// Performs IEEE quiet less-than comparison using APFloat.
    #[inline]
    pub(crate) fn lt(self, rhs: Self) -> bool {
        self.as_apfloat() < rhs.as_apfloat()
    }

    /// Performs IEEE quiet less-than-or-equal comparison using APFloat.
    #[inline]
    pub(crate) fn le(self, rhs: Self) -> bool {
        self.as_apfloat() <= rhs.as_apfloat()
    }

    /// Performs IEEE quiet greater-than comparison using APFloat.
    #[inline]
    pub(crate) fn gt(self, rhs: Self) -> bool {
        self.as_apfloat() > rhs.as_apfloat()
    }

    /// Performs IEEE quiet greater-than-or-equal comparison using APFloat.
    #[inline]
    pub(crate) fn ge(self, rhs: Self) -> bool {
        self.as_apfloat() >= rhs.as_apfloat()
    }

    #[inline]
    fn as_apfloat(self) -> Double {
        rustc_apfloat::Float::from_bits(self.0.into())
    }

    #[inline]
    fn from_apfloat(value: Double) -> Self {
        Self::from_bits(rustc_apfloat::Float::to_bits(value) as u64)
    }
}

#[inline]
const fn canonicalize_nan(bits: u64) -> u64 {
    if bits & EXPONENT_MASK == EXPONENT_MASK && bits & FRACTION_MASK != 0 {
        CANONICAL_NAN_BITS
    } else {
        bits
    }
}
