from __future__ import annotations

import re
from uuid import uuid4

from presidio_analyzer import AnalyzerEngine

from app.domain.models import DetectedEntity, LocationReference


# ────────────────────────────────────────────────────────────────────
# Luhn checksum validator (for credit cards, IMEI, etc.)
# ────────────────────────────────────────────────────────────────────

def _luhn_check(number: str) -> bool:
    """Validate a numeric string using the Luhn algorithm."""
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 2:
        return False
    checksum = 0
    reverse = digits[::-1]
    for i, d in enumerate(reverse):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def _verhoeff_check(number: str) -> bool:
    """Validate a numeric string using the Verhoeff algorithm (used by Aadhaar)."""
    _d = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
        [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
        [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
        [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
        [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
        [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
        [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
        [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
        [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ]
    _p = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
        [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
        [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
        [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
        [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
        [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
        [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ]
    _inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]

    digits = [int(d) for d in number if d.isdigit()]
    c = 0
    for i, digit in enumerate(reversed(digits)):
        c = _d[c][_p[i % 8][digit]]
    return c == 0


# ────────────────────────────────────────────────────────────────────
# UPI handle suffixes (restrict to known handles to avoid matching emails)
# ────────────────────────────────────────────────────────────────────

_UPI_HANDLES = (
    r"(?:upi|paytm|oksbi|okhdfcbank|okicici|okaxis|ybl|ibl|apl|"
    r"axisb|sbi|icici|hdfc|kotak|barodampay|unionbankofindia|"
    r"freecharge|mobikwik|airtel|jio|postbank|citi|rbl|indus|"
    r"federal|dbs|hsbc|sc|idbi|pnb|bob|canara|iob|boi|uco|"
    r"centralbank|mahabank|indianbank|bandhan|equitas)"
)


# ────────────────────────────────────────────────────────────────────
# CUSTOM REGEX PATTERNS — categorized by domain
# ────────────────────────────────────────────────────────────────────

CUSTOM_PATTERNS: dict[str, re.Pattern] = {

    # ══════════════════════════════════════════════════════════════
    #  INDIA-SPECIFIC IDENTIFIERS
    # ══════════════════════════════════════════════════════════════

    # Aadhaar: 12 digits, first digit 2-9 (UIDAI spec), optional separators
    "AADHAAR": re.compile(r"\b[2-9]\d{3}[\s.-]?\d{4}[\s.-]?\d{4}\b"),

    # Aadhaar VID (Virtual ID): 16 digits
    "AADHAAR_VID": re.compile(r"\b\d{4}[\s.-]?\d{4}[\s.-]?\d{4}[\s.-]?\d{4}\b"),

    # Aadhaar Enrolment ID: format 1234/12345/12345
    "AADHAAR_ENROLMENT": re.compile(r"\b\d{4}/\d{5}/\d{5}\b"),

    # PAN (Permanent Account Number): AAAAA0000A
    # 4th char indicates holder type: P=Individual, C=Company, H=HUF, etc.
    "PAN": re.compile(r"\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b"),

    # TAN (Tax Deduction Account Number): AAAA00000A (similar to PAN but different structure)
    "TAN": re.compile(r"\b[A-Z]{4}\d{5}[A-Z]\b"),

    # GSTIN: 2-digit state code + PAN + entity number + Z + checksum
    "GSTIN": re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b"),

    # CIN (Corporate Identification Number): U/L + 5 digits + 2 letters + 4 digits + 3 letters + 6 digits
    "CIN": re.compile(r"\b[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b"),

    # FSSAI License Number: 14-digit food safety license
    "FSSAI_LICENSE": re.compile(
        r"(?:FSSAI|Lic\.?\s*(?:No|Number))\s*[:.#\-]?\s*(\d{14})\b",
        re.IGNORECASE,
    ),

    # Indian Passport: letter + 7 digits (e.g., J1234567)
    "PASSPORT_IN": re.compile(r"\b[A-PR-WYa-pr-wy]\d{7}\b"),

    # Indian Driving License: 2 uppercase state code + 2 digits + optional space + 11 digits
    "DRIVING_LICENSE": re.compile(r"\b[A-Z]{2}\d{2}\s?\d{11}\b"),

    # Voter ID (EPIC): 3 uppercase letters + 7 digits
    "VOTER_ID": re.compile(r"\b[A-Z]{3}\d{7}\b"),

    # Vehicle Registration: state code (2 letters) + district (2 digits) + series (1-2 letters) + number (4 digits)
    "VEHICLE_REG": re.compile(r"\b[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}\b"),

    # UPI ID: user@bankhandle (restricted to known handles)
    "UPI_ID": re.compile(rf"\b[a-zA-Z0-9.\-_]{{2,}}@{_UPI_HANDLES}\b", re.IGNORECASE),

    # IFSC Code: 4 letters + 0 + 6 alphanumeric (the 5th char is always 0)
    "IFSC": re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),

    # Indian Phone Number: +91 or 0 prefix, 10 digits starting with 6-9
    "PHONE_IN": re.compile(
        r"(?:\+91[\s.-]?|0)?[6-9]\d{4}[\s.-]?\d{5}\b"
    ),

    # Indian Bank Account Number: 9-18 digits (context-assisted)
    "BANK_ACCOUNT_IN": re.compile(
        r"(?:A/?C|Account|Acct)[\s.:]*(?:No\.?|Number|#)?\s*[:\-]?\s*(\d{9,18})\b",
        re.IGNORECASE,
    ),

    # EPF (Employee Provident Fund) UAN: 12-digit Universal Account Number
    "EPF_UAN": re.compile(
        r"(?:UAN|Universal\s*Account)[\s.:]*(?:No\.?|Number|#)?\s*[:\-]?\s*(\d{12})\b",
        re.IGNORECASE,
    ),

    # EPF Member ID: region/office/establishment/extension/member (e.g., MH/BOM/12345/000/1234567)
    "EPF_MEMBER_ID": re.compile(
        r"\b[A-Z]{2}/[A-Z]{3}/\d{5}/\d{3}/\d{7}\b"
    ),

    # ESIC Employer Code: XX-XX-XXXXXX-XXX-XXXX
    "ESIC_CODE": re.compile(r"\b\d{2}-\d{2}-\d{6}-\d{3}-\d{4}\b"),

    # Ration Card Number: 2 letter state + 8-12 digits (varies by state)
    "RATION_CARD": re.compile(
        r"(?:Ration\s*Card)[\s.:]*(?:No\.?|Number|#)?\s*[:\-]?\s*([A-Z]{2}\d{8,12})\b",
        re.IGNORECASE,
    ),

    # ══════════════════════════════════════════════════════════════
    #  INTERNATIONAL IDENTIFIERS
    # ══════════════════════════════════════════════════════════════

    # US Social Security Number: NNN-NN-NNNN (with basic invalidity rules)
    "SSN": re.compile(
        r"\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b"
    ),

    # UK National Insurance Number: 2 letters + 6 digits + 1 letter
    "NINO_UK": re.compile(
        r"\b(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]"
        r"\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b",
    ),

    # Canadian Social Insurance Number: 9 digits (with optional separators)
    "SIN_CA": re.compile(
        r"(?:SIN|Social\s*Insurance)[\s.:]*(?:No\.?|Number|#)?\s*[:\-]?\s*"
        r"(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b",
        re.IGNORECASE,
    ),

    # Australian Tax File Number: 8-9 digits
    "TFN_AU": re.compile(
        r"(?:TFN|Tax\s*File\s*Number)[\s.:]*(?:No\.?|#)?\s*[:\-]?\s*(\d{8,9})\b",
        re.IGNORECASE,
    ),

    # IBAN: 2-letter country code + 2 check digits + up to 30 alphanumeric
    "IBAN": re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"),

    # SWIFT / BIC Code: 8 or 11 chars (4 bank + 2 country + 2 location + optional 3 branch)
    "SWIFT": re.compile(r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b"),

    # US Passport: 9 alphanumeric characters
    "PASSPORT_US": re.compile(
        r"(?:Passport)[\s.:]*(?:No\.?|Number|#)?\s*[:\-]?\s*([A-Z0-9]{9})\b",
        re.IGNORECASE,
    ),

    # EU/Schengen Passport: 2-letter prefix + 7 digits (generic)
    "PASSPORT_EU": re.compile(
        r"(?:Passport)[\s.:]*(?:No\.?|Number|#)?\s*[:\-]?\s*([A-Z]{2}\d{7})\b",
        re.IGNORECASE,
    ),

    # US EIN (Employer Identification Number): NN-NNNNNNN
    "EIN_US": re.compile(r"\b\d{2}-\d{7}\b"),

    # US ITIN (Individual Taxpayer Identification Number): 9XX-XX-XXXX
    "ITIN_US": re.compile(r"\b9\d{2}[- ]?\d{2}[- ]?\d{4}\b"),

    # Mexican CURP: 18-character national ID
    "CURP_MX": re.compile(
        r"\b[A-Z]{4}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d\b"
    ),

    # Brazilian CPF: XXX.XXX.XXX-XX
    "CPF_BR": re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"),

    # South Korean RRN: YYMMDD-NNNNNNN
    "RRN_KR": re.compile(r"\b\d{6}-[1-4]\d{6}\b"),

    # Singapore NRIC/FIN: S/T/F/G/M + 7 digits + letter
    "NRIC_SG": re.compile(r"\b[STFGM]\d{7}[A-Z]\b"),

    # Hong Kong ID: 1-2 letters + 6 digits + check digit in parentheses
    "HKID": re.compile(r"\b[A-Z]{1,2}\d{6}\([0-9A]\)"),

    # South African ID: 13 digits (YYMMDD + gender + citizenship + race + checksum)
    "SA_ID": re.compile(r"\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{7}\b"),

    # ══════════════════════════════════════════════════════════════
    #  FINANCIAL — CREDIT CARDS (with Luhn post-validation)
    # ══════════════════════════════════════════════════════════════

    # Visa: starts with 4, 13 or 16 digits
    "CREDIT_CARD_VISA": re.compile(
        r"\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,4}\b"
    ),

    # Mastercard: starts with 51-55 or 2221-2720, 16 digits
    "CREDIT_CARD_MASTERCARD": re.compile(
        r"\b(?:5[1-5]\d{2}|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)"
        r"[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"
    ),

    # American Express: starts with 34 or 37, 15 digits
    "CREDIT_CARD_AMEX": re.compile(
        r"\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b"
    ),

    # Discover: starts with 6011, 622126-622925, 644-649, or 65
    "CREDIT_CARD_DISCOVER": re.compile(
        r"\b(?:6011|65\d{2}|64[4-9]\d)[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"
    ),

    # Diners Club: starts with 300-305, 36, or 38, 14 digits
    "CREDIT_CARD_DINERS": re.compile(
        r"\b3(?:0[0-5]|[68]\d)\d[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{2}\b"
    ),

    # JCB: starts with 2131, 1800, or 35, 15-16 digits
    "CREDIT_CARD_JCB": re.compile(
        r"\b(?:2131|1800|35\d{3})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{3,4}\b"
    ),

    # RuPay (India): starts with 60, 65, 81, or 82, 16 digits
    "CREDIT_CARD_RUPAY": re.compile(
        r"\b(?:60|65|81|82)\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"
    ),

    # Generic catch-all for 13-19 digit card-like numbers
    "CREDIT_CARD_GENERIC": re.compile(
        r"\b(?:\d[\s-]?){13,19}\b"
    ),

    # ══════════════════════════════════════════════════════════════
    #  NETWORK & TECHNICAL IDENTIFIERS
    # ══════════════════════════════════════════════════════════════

    # IPv4 Address
    "IP_ADDRESS_V4": re.compile(
        r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"
    ),

    # IPv6 Address (simplified — matches common representations)
    "IP_ADDRESS_V6": re.compile(
        r"\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b"
        r"|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b"
        r"|\b::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}\b"
    ),

    # MAC Address: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
    "MAC_ADDRESS": re.compile(
        r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b"
    ),

    # IMEI (International Mobile Equipment Identity): 15 digits (Luhn-validated)
    "IMEI": re.compile(r"\b\d{15}\b"),

    # ══════════════════════════════════════════════════════════════
    #  CRYPTO WALLETS
    # ══════════════════════════════════════════════════════════════

    # Bitcoin address (legacy P2PKH, P2SH, and Bech32)
    "CRYPTO_BTC": re.compile(
        r"\b(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b"
    ),

    # Ethereum address: 0x + 40 hex chars
    "CRYPTO_ETH": re.compile(r"\b0x[0-9a-fA-F]{40}\b"),

    # ══════════════════════════════════════════════════════════════
    #  CREDENTIALS & SECRETS
    # ══════════════════════════════════════════════════════════════

    # AWS Access Key ID: starts with AKIA
    "AWS_ACCESS_KEY": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),

    # AWS Secret Access Key: 40-char base64-like string near "aws" keyword
    "AWS_SECRET_KEY": re.compile(
        r"(?i:aws.{0,20}(?:secret|key).{0,10})['\"]?([0-9a-zA-Z/+=]{40})['\"]?",
        re.IGNORECASE,
    ),

    # Google API Key: starts with AIza
    "GOOGLE_API_KEY": re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"),

    # GitHub Personal Access Token
    "GITHUB_PAT": re.compile(r"\bgh[pos]_[0-9a-zA-Z]{36,}\b"),

    # Stripe Secret Key
    "STRIPE_KEY": re.compile(r"\bsk_live_[0-9a-zA-Z]{24,}\b"),

    # Generic API Key pattern: keyword + key-like value
    "API_KEY_GENERIC": re.compile(
        r"(?:api[_-]?key|apikey|api[_-]?secret|api[_-]?token)"
        r"\s*[=:]\s*['\"]?([a-zA-Z0-9\-_]{20,})['\"]?",
        re.IGNORECASE,
    ),

    # JWT Token: three base64url-encoded segments separated by dots
    "JWT_TOKEN": re.compile(
        r"\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]*\b"
    ),

    # Private Key block headers (RSA, EC, PGP, SSH, DSA)
    "PRIVATE_KEY": re.compile(
        r"-----BEGIN\s+(?:(?:RSA|EC|PGP|DSA|OPENSSH)\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----"
    ),

    # Generic Password in config: password = "..." or password: "..."
    "PASSWORD_IN_CONFIG": re.compile(
        r"(?:password|passwd|pwd|secret)\s*[=:]\s*['\"](.{8,}?)['\"]",
        re.IGNORECASE,
    ),

    # ══════════════════════════════════════════════════════════════
    #  PERSONAL INFORMATION
    # ══════════════════════════════════════════════════════════════

    # Email Address (RFC 5322 simplified)
    "EMAIL": re.compile(
        r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"
    ),

    # Date of Birth (keyword-prefixed for precision)
    "DATE_OF_BIRTH": re.compile(
        r"(?:DOB|D\.?\s?O\.?\s?B\.?|Date\s*of\s*Birth|Born\s*(?:on)?)"
        r"\s*[:.\\-]?\s*(\d{1,2}[/\-. ]\d{1,2}[/\-. ]\d{2,4})",
        re.IGNORECASE,
    ),

    # Parent / Guardian Name (S/O, D/O, W/O, C/O, Father, Mother, Husband)
    "PARENT_NAME": re.compile(
        r"(?:S/O|D/O|W/O|C/O|Father'?s?\s*(?:Name)?|Mother'?s?\s*(?:Name)?"
        r"|Husband'?s?\s*(?:Name)?|Guardian'?s?\s*(?:Name)?)"
        r"\s*[:.\\-]?\s*([A-Za-z][A-Za-z .]{2,40})",
        re.IGNORECASE,
    ),

    # PIN Code (Indian postal code): 6 digits, first digit 1-9
    "PIN_CODE": re.compile(r"\b[1-9]\d{5}\b"),

    # US ZIP Code: 5 digits or 5+4 format
    "ZIP_CODE_US": re.compile(r"\b\d{5}(?:-\d{4})?\b"),

    # UK Postcode
    "POSTCODE_UK": re.compile(
        r"\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b",
        re.IGNORECASE,
    ),

    # Gender keyword
    "GENDER": re.compile(r"\b(?:MALE|FEMALE|TRANSGENDER|NON[\s-]?BINARY)\b", re.IGNORECASE),

    # Age (with keyword prefix for precision)
    "AGE": re.compile(
        r"(?:Age|Aged?)[\s:]*(\d{1,3})\s*(?:years?|yrs?|Y\.?O\.?)?\b",
        re.IGNORECASE,
    ),

    # Blood Group
    "BLOOD_GROUP": re.compile(
        r"\b(?:A|B|AB|O)[+\-]"
    ),

    # ══════════════════════════════════════════════════════════════
    #  MEDICAL / HEALTH
    # ══════════════════════════════════════════════════════════════

    # US Medicare Beneficiary Identifier (MBI): 11-char alphanumeric
    "MEDICARE_MBI": re.compile(
        r"\b[1-9][A-Z][A-Z0-9]\d[A-Z][A-Z0-9]\d[A-Z]{2}\d{2}\b"
    ),

    # US National Provider Identifier (NPI): 10 digits starting with 1 or 2
    "NPI_US": re.compile(r"\b[12]\d{9}\b"),

    # US DEA Registration Number: 2 letters + 7 digits
    "DEA_NUMBER": re.compile(r"\b[ABCDEFGHJKLMNPRSTUabcdefghjklmnprstu][A-Za-z]\d{7}\b"),

    # Medical Record Number (contextual): keyword + alphanumeric
    "MEDICAL_RECORD": re.compile(
        r"(?:MRN|Medical\s*Record|Patient\s*ID|Chart\s*(?:No\.?|Number))"
        r"\s*[:.#\-]?\s*([A-Z0-9\-]{4,20})\b",
        re.IGNORECASE,
    ),

    # Health Insurance Policy Number (contextual)
    "HEALTH_INSURANCE_ID": re.compile(
        r"(?:Policy|Insurance|Member|Subscriber)\s*(?:No\.?|Number|ID|#)"
        r"\s*[:.\\-]?\s*([A-Z0-9\-]{6,20})\b",
        re.IGNORECASE,
    ),

    # UK NHS Number: 3-3-4 digit format
    "NHS_NUMBER": re.compile(
        r"\b\d{3}\s?\d{3}\s?\d{4}\b"
    ),

    # ══════════════════════════════════════════════════════════════
    #  LEGAL / JUDICIAL (India)
    # ══════════════════════════════════════════════════════════════

    # FIR Number: keyword + alphanumeric
    "FIR_NUMBER": re.compile(
        r"(?:FIR|First\s*Information\s*Report)\s*(?:No\.?|Number|#)?"
        r"\s*[:.\\-]?\s*(\d{1,6}/\d{2,4})\b",
        re.IGNORECASE,
    ),

    # Case Number: keyword + year/number format
    "CASE_NUMBER": re.compile(
        r"(?:Case|Cause|Suit)\s*(?:No\.?|Number|#)\s*[:.\\-]?\s*"
        r"([A-Z0-9.\-/]{3,30})",
        re.IGNORECASE,
    ),

    # ══════════════════════════════════════════════════════════════
    #  GEOGRAPHIC / LOCATION
    # ══════════════════════════════════════════════════════════════

    # GPS Coordinates: lat, lng (decimal degrees)
    "GPS_COORDINATES": re.compile(
        r"[-+]?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?)\s*,\s*"
        r"[-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d+)?)"
    ),

    # ══════════════════════════════════════════════════════════════
    #  VEHICLE / TRANSPORT
    # ══════════════════════════════════════════════════════════════

    # US License Plate (generic — varies heavily by state, broad catch)
    "LICENSE_PLATE_US": re.compile(
        r"\b[A-Z0-9]{1,4}[\s-]?[A-Z0-9]{2,5}\b"
    ),

    # VIN (Vehicle Identification Number): 17 alphanumeric (excluding I, O, Q)
    "VIN": re.compile(
        r"\b[A-HJ-NPR-Z0-9]{17}\b"
    ),
}


# ────────────────────────────────────────────────────────────────────
# Confidence tiers: how confident we are when a pattern matches
# ────────────────────────────────────────────────────────────────────

HIGH_CONFIDENCE_PATTERNS = {
    "AADHAAR", "PAN", "GSTIN", "CIN", "PASSPORT_IN", "DRIVING_LICENSE",
    "SSN", "NINO_UK", "IBAN", "CREDIT_CARD_VISA", "CREDIT_CARD_MASTERCARD",
    "CREDIT_CARD_AMEX", "CREDIT_CARD_DISCOVER", "CREDIT_CARD_DINERS",
    "CREDIT_CARD_JCB", "CREDIT_CARD_RUPAY",
    "CPF_BR", "CURP_MX", "RRN_KR", "NRIC_SG", "HKID", "SA_ID",
    "AWS_ACCESS_KEY", "GITHUB_PAT", "STRIPE_KEY", "PRIVATE_KEY",
    "JWT_TOKEN", "EPF_MEMBER_ID", "ESIC_CODE", "UPI_ID",
}

MEDIUM_CONFIDENCE_PATTERNS = {
    "EMAIL", "PHONE_IN", "DATE_OF_BIRTH", "PARENT_NAME", "VOTER_ID",
    "VEHICLE_REG", "IFSC", "SWIFT", "TAN", "AADHAAR_VID",
    "AADHAAR_ENROLMENT", "BANK_ACCOUNT_IN", "EPF_UAN",
    "SIN_CA", "TFN_AU", "PASSPORT_US", "PASSPORT_EU", "EIN_US",
    "FSSAI_LICENSE", "RATION_CARD", "MEDICAL_RECORD",
    "HEALTH_INSURANCE_ID", "GOOGLE_API_KEY", "AWS_SECRET_KEY",
    "API_KEY_GENERIC", "PASSWORD_IN_CONFIG",
    "CRYPTO_BTC", "CRYPTO_ETH", "MAC_ADDRESS", "IP_ADDRESS_V4",
    "MEDICARE_MBI", "NPI_US", "DEA_NUMBER", "NHS_NUMBER",
    "FIR_NUMBER", "CASE_NUMBER", "GPS_COORDINATES",
}

LOW_CONFIDENCE_PATTERNS = {
    "PIN_CODE", "ZIP_CODE_US", "POSTCODE_UK", "GENDER", "AGE",
    "BLOOD_GROUP", "IP_ADDRESS_V6", "IMEI", "CREDIT_CARD_GENERIC",
    "ITIN_US", "VIN", "LICENSE_PLATE_US",
}


def _confidence_for(pattern_name: str) -> float:
    """Return confidence score based on how specific the pattern is."""
    if pattern_name in HIGH_CONFIDENCE_PATTERNS:
        return 0.90
    if pattern_name in MEDIUM_CONFIDENCE_PATTERNS:
        return 0.75
    return 0.55


# ────────────────────────────────────────────────────────────────────
# Patterns that need Luhn post-validation
# ────────────────────────────────────────────────────────────────────

_LUHN_VALIDATED_PATTERNS = {
    "CREDIT_CARD_VISA", "CREDIT_CARD_MASTERCARD", "CREDIT_CARD_AMEX",
    "CREDIT_CARD_DISCOVER", "CREDIT_CARD_DINERS", "CREDIT_CARD_JCB",
    "CREDIT_CARD_RUPAY", "CREDIT_CARD_GENERIC", "IMEI",
}

_VERHOEFF_VALIDATED_PATTERNS = {"AADHAAR"}


# ────────────────────────────────────────────────────────────────────
# Patterns that are overly broad and need keyword-context to fire.
# These only match if a related keyword appears within 80 chars.
# ────────────────────────────────────────────────────────────────────

_CONTEXT_REQUIRED: dict[str, re.Pattern] = {
    "NHS_NUMBER": re.compile(
        r"(?:NHS|National\s*Health|Health\s*Service)", re.IGNORECASE
    ),
    "CREDIT_CARD_GENERIC": re.compile(
        r"(?:card|credit|debit|visa|master|amex|payment|expir)", re.IGNORECASE
    ),
    "IMEI": re.compile(
        r"(?:IMEI|device|handset|mobile|phone|serial)", re.IGNORECASE
    ),
    "VIN": re.compile(
        r"(?:VIN|vehicle|chassis|car|automobile)", re.IGNORECASE
    ),
    "LICENSE_PLATE_US": re.compile(
        r"(?:plate|license|registration|vehicle)", re.IGNORECASE
    ),
    "NPI_US": re.compile(
        r"(?:NPI|National\s*Provider|provider\s*(?:ID|number|identifier))", re.IGNORECASE
    ),
}


# Minimum Presidio confidence to accept a detection (filters noisy US-centric
# false positives like us_driver_license at 0.01 on Indian documents).
MIN_PRESIDIO_CONFIDENCE = 0.15


# ────────────────────────────────────────────────────────────────────
# Offset-map helpers (unchanged)
# ────────────────────────────────────────────────────────────────────

def _build_segment_offset_map(
    text_segments: list[dict],
    bounding_boxes: list[dict],
    page: int,
) -> tuple[str, list[tuple[int, int, int]]]:
    """Build *page_text* and a parallel offset map.

    Returns
    -------
    page_text : str
        Segments for *page* joined with ``\\n``.
    offset_map : list[tuple[start_offset, end_offset, seg_global_index]]
        One entry per segment telling which character range in *page_text*
        corresponds to which index into the **original** *text_segments* /
        *bounding_boxes* lists (they are 1-to-1 by construction in
        ``SignalExtractor``).
    """
    seg_indices: list[int] = []
    for global_idx, seg in enumerate(text_segments):
        if seg.get("page", 1) == page:
            seg_indices.append(global_idx)

    offset_map: list[tuple[int, int, int]] = []
    parts: list[str] = []
    offset = 0
    for local_idx, global_idx in enumerate(seg_indices):
        text = text_segments[global_idx].get("text", "")
        parts.append(text)
        end = offset + len(text)
        offset_map.append((offset, end, global_idx))
        offset = end + 1  # +1 for the "\n" separator

    page_text = "\n".join(parts)
    return page_text, offset_map


def map_bbox_by_offset(
    entity: DetectedEntity,
    offset_map: list[tuple[int, int, int]],
    bounding_boxes: list[dict],
) -> None:
    """Set ``entity.location_reference.bbox`` using the character-offset map.

    Falls back to a substring scan when the offset map cannot resolve the
    entity (e.g. entity produced outside the normal detection flow).
    """
    start = entity.location_reference.start_char
    if start is not None:
        for seg_start, seg_end, global_idx in offset_map:
            if seg_start <= start < seg_end:
                bb = bounding_boxes[global_idx] if global_idx < len(bounding_boxes) else None
                if bb and bb.get("bbox"):
                    entity.location_reference.bbox = bb["bbox"]
                return  # resolved


# ────────────────────────────────────────────────────────────────────
# Main detector
# ────────────────────────────────────────────────────────────────────

class EntityDetector:
    def __init__(self) -> None:
        self.analyzer = AnalyzerEngine()

    def detect(
        self,
        text_segments: list[dict],
        bounding_boxes: list[dict],
        timestamps: list[dict],
    ) -> list[DetectedEntity]:
        entities: list[DetectedEntity] = []

        # ---- Per-page detection to preserve page numbers ----
        pages: set[int] = {seg.get("page", 1) for seg in text_segments}

        # Collect per-page offset maps so we can reuse them for bbox mapping
        page_offset_maps: dict[int, list[tuple[int, int, int]]] = {}

        for page_num in sorted(pages):
            page_text, offset_map = _build_segment_offset_map(
                text_segments, bounding_boxes, page_num,
            )
            page_offset_maps[page_num] = offset_map
            if not page_text.strip():
                continue

            # Presidio detection (with confidence threshold)
            try:
                results = self.analyzer.analyze(text=page_text, language="en")
                for result in results:
                    if float(result.score) < MIN_PRESIDIO_CONFIDENCE:
                        continue
                    raw = page_text[result.start : result.end]
                    entities.append(
                        DetectedEntity(
                            entity_id=uuid4().hex,
                            type=result.entity_type.lower(),
                            raw_value=raw,
                            location_reference=LocationReference(
                                page=page_num,
                                start_char=result.start,
                                end_char=result.end,
                            ),
                            confidence_score=float(result.score),
                        )
                    )
            except Exception:
                pass

            # Custom pattern detection
            for entity_name, pattern in CUSTOM_PATTERNS.items():
                for match in pattern.finditer(page_text):
                    raw_value = match.group(1) if match.lastindex else match.group(0)
                    digits_only = re.sub(r"[\s\-.]", "", raw_value)

                    # ── Luhn checksum validation ──
                    if entity_name in _LUHN_VALIDATED_PATTERNS:
                        if not _luhn_check(digits_only):
                            continue

                    # ── Verhoeff checksum validation (Aadhaar) ──
                    if entity_name in _VERHOEFF_VALIDATED_PATTERNS:
                        if len(digits_only) == 12 and not _verhoeff_check(digits_only):
                            continue

                    # ── Context-keyword gating ──
                    if entity_name in _CONTEXT_REQUIRED:
                        ctx_pattern = _CONTEXT_REQUIRED[entity_name]
                        # Look for keyword within 80 chars before or after the match
                        ctx_start = max(0, match.start() - 80)
                        ctx_end = min(len(page_text), match.end() + 80)
                        context_window = page_text[ctx_start:ctx_end]
                        if not ctx_pattern.search(context_window):
                            continue

                    entities.append(
                        DetectedEntity(
                            entity_id=uuid4().hex,
                            type=entity_name.lower(),
                            raw_value=raw_value,
                            location_reference=LocationReference(
                                page=page_num,
                                start_char=match.start(),
                                end_char=match.end(),
                            ),
                            confidence_score=_confidence_for(entity_name),
                        )
                    )

        # ---- Deduplicate: same type + value at the same character position ----
        seen: set[tuple[int | None, str, str, int | None]] = set()
        unique: list[DetectedEntity] = []
        for ent in entities:
            key = (ent.location_reference.page, ent.type.lower(), ent.raw_value, ent.location_reference.start_char)
            if key not in seen:
                seen.add(key)
                unique.append(ent)
        entities = unique

        # ---- Map bounding boxes using offset map (position-aware) ----
        for ent in entities:
            page_num = ent.location_reference.page or 1
            omap = page_offset_maps.get(page_num, [])
            map_bbox_by_offset(ent, omap, bounding_boxes)

        # ---- Map audio timestamps ----
        if timestamps:
            for ent in entities:
                for segment in timestamps:
                    if ent.raw_value and ent.raw_value in segment.get("text", ""):
                        ent.location_reference.start_sec = segment.get("start_sec")
                        ent.location_reference.end_sec = segment.get("end_sec")
                        break

        return entities
