import os
os.environ.setdefault("DATABASE_URL", "sqlite:///./healthcare.db")
from alembic import command
from alembic.config import Config

base_dir = os.getcwd()
ini_path = os.path.join(base_dir, "alembic.ini")
cfg = Config(ini_path)
cfg.set_main_option("script_location", os.path.join(base_dir, "backend", "migrations"))
try:
    command.upgrade(cfg, "d0a1u0m1n1")
    print("MIGRATION_APPLIED: d0a1u0m1n1")
except Exception as e:
    print("MIGRATION_ERROR:", repr(e))
