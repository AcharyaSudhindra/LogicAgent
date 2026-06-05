from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from .database import Base

class VerificationSession(Base):
    __tablename__ = "verification_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    checker = Column(String)
    goal = Column(String)
    code = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class VCDUpload(Base):
    __tablename__ = "vcd_uploads"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
