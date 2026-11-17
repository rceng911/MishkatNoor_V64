"""Attendance labels shared by reports; permission is separate from excused absence."""

ATTENDANCE_LABELS51 = {
    "present": "حاضر",
    "absent": "غائب",
    "excused": "غائب بعذر",
    "permission": "مستأذن",
}

# Both states represent a student who attended and can be evaluated.
ATTENDED = ("present", "permission")
