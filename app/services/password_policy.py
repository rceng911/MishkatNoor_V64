import re
import string
ALLOWED_SYMBOLS = string.punctuation
def validate_password(password):
    if not 8 <= len(password) <= 128: return False, "كلمة المرور من 8 إلى 128 حرفًا أو رمزًا"
    if not re.search(r"[A-Z]", password): return False, "أضف حرفًا إنجليزيًا كبيرًا"
    if not re.search(r"[a-z]", password): return False, "أضف حرفًا إنجليزيًا صغيرًا"
    if not any(c in ALLOWED_SYMBOLS for c in password): return False, "أضف رمزًا خاصًا مثل !@#$%"
    return True, ""
