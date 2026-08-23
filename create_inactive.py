import os
os.environ["DATABASE_URL"] = "sqlite:///E:/AI-Healthcare-System-main/AI-Healthcare-System-main/healthcare.db"
from backend import auth, database, models

with database.get_db_context() as db:
    existing = db.query(models.User).filter(models.User.username == "inactive_test").first()
    if existing:
        existing.is_active = 0
        db.commit()
        print("updated existing inactive_test is_active=0")
    else:
        u = models.User(
            username="inactive_test",
            hashed_password=auth.get_password_hash("inactive123"),
            email="inactive_test@clinos.com",
            role="patient",
            is_active=0,
        )
        db.add(u)
        db.commit()
        print("created inactive_test is_active=0 id=", u.id)
