from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

# --- Registration Models ---
class FarmRegistrationRequest(BaseModel):
    name: str

class FarmRegistrationResponse(BaseModel):
    farm_id: UUID
    name: str
    created_at: datetime

# --- 1. Basic Animals ---
class DelproBasicAnimal(BaseModel):
    OID: int
    SystemEntryTimeStamp: Optional[datetime] = None
    Number: Optional[int] = None
    AnimalGuid: Optional[str] = None
    Name: Optional[str] = None
    Type: Optional[int] = None
    Sex: Optional[int] = None
    Breed: Optional[int] = None
    BirthDate: Optional[datetime] = None
    Comment: Optional[str] = None
    CommentDate: Optional[datetime] = None
    ExitDate: Optional[datetime] = None
    Modified: Optional[datetime] = None
    PedigreeInfo: Optional[int] = None
    CalfSize: Optional[str] = None
    CalfHealthStatus: Optional[str] = None
    CalfUsage: Optional[str] = None
    Group: Optional[int] = None
    TransponderID: Optional[int] = None
    TransponderType: Optional[int] = None
    EarTagLeft: Optional[int] = None
    EarTagRight: Optional[int] = None
    BirthWeight: Optional[float] = None
    IsTwin: Optional[bool] = None
    BirthEvent: Optional[str] = None
    ToBeCulled: Optional[bool] = None
    LatestHistoryIndex: Optional[int] = None
    OptimisticLockField: Optional[int] = None
    GCRecord: Optional[str] = None
    ObjectType: Optional[int] = None
    ManualRationControl: Optional[bool] = None
    CurrentFeedTable: Optional[int] = None
    ConsumptionRate: Optional[int] = None
    ActivitySetting: Optional[int] = None
    BullID: Optional[str] = None
    ExitType: Optional[int] = None
    DrinkData: Optional[int] = None
    MilkingTestAnimal: Optional[str] = None
    HairColor: Optional[str] = None
    MilkConfig: Optional[int] = None
    Imported: Optional[bool] = None
    Exported: Optional[bool] = None
    WeightIncreaseDecreaseStatus: Optional[str] = None
    farm_id: Optional[UUID] = None

# --- 2. Animals Lactations Summary ---
class DelproAnimalsLactationsSummary(BaseModel):
    OID: int
    SystemEntryTimeStamp: Optional[datetime] = None
    Animal: Optional[int] = None
    LactationNumber: Optional[int] = None
    StartDate: Optional[datetime] = None
    EndDate: Optional[datetime] = None
    PeakYield: Optional[float] = None
    DaysToPeak: Optional[int] = None
    OptimisticLockField: Optional[int] = None
    GCRecord: Optional[str] = None
    MatureEquivalent: Optional[str] = None
    HistoryTotalYield: Optional[float] = None
    farm_id: Optional[UUID] = None

# --- 3. Sessions Milk Yield ---
class DelproSessionsMilkYield(BaseModel):
    SessionNo: str
    TotalYield: Optional[float] = None
    Destination: Optional[int] = None
    User: Optional[str] = None
    ExpectedYield: Optional[float] = None
    ObjectGuid: Optional[UUID] = None
    BeginTime: Optional[datetime] = None
    BasicAnimal: Optional[int] = None
    AnimalDaily: Optional[int] = None
    EndTime: Optional[datetime] = None
    MilkingDevice: Optional[int] = None
    PreviousEndTime: Optional[datetime] = None
    AvgConductivity: Optional[float] = None
    MaxConductivity: Optional[float] = None
    AverageConductivity7Days: Optional[float] = None
    RelativeConductivity: Optional[float] = None
    AverageBlood: Optional[float] = None
    MaxBlood: Optional[float] = None
    ModifiedSource: Optional[int] = None
    SampleTube: Optional[int] = None
    SampleTubeRack: Optional[int] = None
    SampleTubePosition: Optional[int] = None
    ObjectType: Optional[int] = None
    OID: Optional[int] = None
    SystemEntryTimeStamp: Optional[datetime] = None
    farm_id: Optional[UUID] = None

# --- 4. Voluntary Sessions Milk Yield ---
class DelproVoluntarySessionsMilkYield(BaseModel):
    OID: int
    ExpectedRateLF: Optional[float] = None
    ExpectedRateRF: Optional[float] = None
    ExpectedRateLR: Optional[float] = None
    ExpectedRateRR: Optional[float] = None
    CarryoverLF: Optional[float] = None
    CarryoverRF: Optional[float] = None
    CarryoverLR: Optional[float] = None
    CarryoverRR: Optional[float] = None
    QuarterLFYield: Optional[float] = None
    QuarterRFYield: Optional[float] = None
    QuarterLRYield: Optional[float] = None
    QuarterRRYield: Optional[float] = None
    MilkType: Optional[int] = None
    Kickoff: Optional[int] = None
    Incomplete: Optional[int] = None
    NotMilkedTeats: Optional[int] = None
    ConductivityLF: Optional[float] = None
    ConductivityRF: Optional[float] = None
    ConductivityLR: Optional[float] = None
    ConductivityRR: Optional[float] = None
    BloodLF: Optional[float] = None
    BloodRF: Optional[float] = None
    BloodLR: Optional[float] = None
    BloodRR: Optional[float] = None
    PeakFlowLF: Optional[float] = None
    PeakFlowRF: Optional[float] = None
    PeakFlowLR: Optional[float] = None
    PeakFlowRR: Optional[float] = None
    MeanFlowLF: Optional[float] = None
    MeanFlowRF: Optional[float] = None
    MeanFlowLR: Optional[float] = None
    MeanFlowRR: Optional[float] = None
    Occ: Optional[int] = None
    Mdi: Optional[float] = None
    Performance: Optional[int] = None
    CurrentCombinedAmd: Optional[float] = None
    YieldExpectedLF: Optional[float] = None
    YieldExpectedRF: Optional[float] = None
    YieldExpectedLR: Optional[float] = None
    YieldExpectedRR: Optional[float] = None
    UdderCounter: Optional[int] = None
    UdderCounterFlags: Optional[int] = None
    TeatCounterLF: Optional[int] = None
    TeatCounterLR: Optional[int] = None
    TeatCounterRF: Optional[int] = None
    TeatCounterRR: Optional[int] = None
    TeatCounterFlagsLF: Optional[int] = None
    TeatCounterFlagsLR: Optional[int] = None
    TeatCounterFlagsRF: Optional[int] = None
    TeatCounterFlagsRR: Optional[int] = None
    CleaningProgramNumber: Optional[int] = None
    DiversionReason: Optional[int] = None
    AmsSerialData: Optional[str] = None
    OccAverage: Optional[int] = None
    EnabledTeats: Optional[int] = None
    OccHealthClass: Optional[int] = None
    OccEmr: Optional[int] = None
    SelectiveTakeoffApplied: Optional[bool] = None
    AlternativeAttach: Optional[int] = None
    SmartPulsationRatio: Optional[int] = None
    TeatsFailedCleaning: Optional[int] = None
    MilkFlowDuration: Optional[int] = None
    farm_id: Optional[UUID] = None

# --- 5. History Milk Diversion Info ---
class DelproHistoryMilkDiversionInfo(BaseModel):
    OID: int
    Animal: Optional[int] = None
    Group: Optional[int] = None
    LactationNumber: Optional[int] = None
    DivertDate: Optional[datetime] = None
    DivertReason: Optional[int] = None
    DivertedMilk: Optional[float] = None
    DiversionCost: Optional[float] = None
    farm_id: Optional[UUID] = None

# --- Ingest Models ---
class IngestPayload(BaseModel):
    farm_id: str # Farm ID
    basic_animals: List[DelproBasicAnimal] = []
    lactations_summary: List[DelproAnimalsLactationsSummary] = []
    sessions_milk_yield: List[DelproSessionsMilkYield] = []
    voluntary_sessions_milk_yield: List[DelproVoluntarySessionsMilkYield] = []
    history_milk_diversion_info: List[DelproHistoryMilkDiversionInfo] = []

class SyncStatusResponse(BaseModel):
    last_oid: int # Used for sessions watermark
    last_animal_oid: int # Used for basic animals watermark
    last_lactation_oid: int # Used for lactations watermark
    last_history_milk_diversion_oid: int = 0 # Used for history milk diversion watermark
