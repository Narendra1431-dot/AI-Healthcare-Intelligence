from backend import models
from backend.database import get_db_context
from datetime import datetime, timedelta, timezone

with get_db_context() as db:
    patient = db.query(models.User).filter(models.User.username=='demo_patient').first()
    now = datetime.now(timezone.utc)
    month_ago = now - timedelta(days=30)
    
    # Add a completed appointment for Scenario G
    existing_completed = db.query(models.Appointment).filter(
        models.Appointment.user_id==patient.id, 
        models.Appointment.status=='Completed'
    ).first()
    if not existing_completed:
        completed_appt = models.Appointment(
            user_id=patient.id, doctor_id=patient.id, specialist='General Medicine',
            reason='Completed follow-up visit (synthetic)',
            status='Completed', date_time=now - timedelta(days=90)
        )
        db.add(completed_appt)
        print('Added completed appointment')
    
    # Add a cancelled appointment for Scenario G
    existing_cancelled = db.query(models.Appointment).filter(
        models.Appointment.user_id==patient.id,
        models.Appointment.status=='Cancelled'
    ).first()
    if not existing_cancelled:
        cancelled_appt = models.Appointment(
            user_id=patient.id, doctor_id=patient.id, specialist='General Medicine',
            reason='Cancelled appointment (synthetic)',
            status='Cancelled', date_time=now - timedelta(days=20)
        )
        db.add(cancelled_appt)
        print('Added cancelled appointment')
    
    # Ensure upcoming appointment exists for Scenario G
    existing_upcoming = db.query(models.Appointment).filter(
        models.Appointment.user_id==patient.id,
        models.Appointment.status=='Scheduled'
    ).first()
    if not existing_upcoming:
        upcoming_appt = models.Appointment(
            user_id=patient.id, doctor_id=patient.id, specialist='General Medicine',
            reason='Upcoming follow-up (synthetic)',
            status='Scheduled', date_time=now + timedelta(days=14)
        )
        db.add(upcoming_appt)
        print('Added upcoming appointment')
    
    # Add bed assignment data for Scenario H
    facility = db.query(models.HospitalFacility).first()
    facility_name = facility.name if facility else "None"
    print(f'\nFacility: {facility_name}')
    
    dept = db.query(models.Department).first()
    dept_name = dept.name if dept else "None"
    print(f'Department: {dept_name}')
    
    bed_count = db.query(models.Bed).count()
    print(f'Beds: {bed_count}')
    
    # Check bed assignments
    assigned_beds = db.query(models.Bed).filter(models.Bed.patient_id != None).limit(5).all()
    print(f'Beds with patient assignments: {len(assigned_beds)}')
    for b in assigned_beds[:3]:
        print(f'  Bed {b.bed_number}: status={b.status}, patient_id={b.patient_id}')
    
    db.commit()
    print('\nDone enhancing data!')