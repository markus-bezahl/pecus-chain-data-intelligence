using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Net.Http.Json;
using Microsoft.Data.SqlClient; // Correct namespace for .NET 8
using System.Text.Json; // Added for JSON config handling

using System.Runtime.InteropServices; // Added for OS detection

// --- ENTRY POINT ---
var builder = Host.CreateApplicationBuilder(args);

// FORCE LOADING ENV VARS
builder.Configuration.AddEnvironmentVariables();

// Add Windows Service configuration (Safe to call on Mac/Linux - it just does nothing there)
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "PecusChainAgent";
});

// Register HTTP Client
builder.Services.AddHttpClient<SyncWorker>(); // Don't configure BaseAddress here to avoid DI issues

// Register the main worker service
builder.Services.AddHostedService<SyncWorker>();

var host = builder.Build();
host.Run();

// --- WORKER SERVICE ---
public class SyncWorker : BackgroundService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<SyncWorker> _logger;
    private readonly IConfiguration _configuration;
    private readonly string _apiBaseUrl;
    private const string ConfigFileName = "agent_config.json";

    // CONFIGURATION
    private const int PollingIntervalSeconds = 1800; // 30 minutes
    
    public SyncWorker(HttpClient httpClient, ILogger<SyncWorker> logger, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _logger = logger;
        _configuration = configuration;

        // Manually resolve URL
        var url = _configuration["API_BASE_URL"];
        if (string.IsNullOrEmpty(url)) url = "http://host.docker.internal:8000";
        url = url.Replace("\"", "").Replace("'", "").Trim();
        _apiBaseUrl = url;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("API Target: {ApiUrl}", _apiBaseUrl);

        // 1. Resolve FARM_ID (Env Var > Config File > Interactive Registration)
        string? farmId = _configuration["FARM_ID"];

        if (string.IsNullOrEmpty(farmId) || farmId == "UNKNOWN_FARM")
        {
            farmId = LoadFarmIdFromConfig();
        }

        if (string.IsNullOrEmpty(farmId))
        {
            _logger.LogWarning("⚠️ FARM_ID is not set via Env or Config.");
            
            // Check if we are running in interactive mode (Docker -it or Console)
            if (!Console.IsInputRedirected)
            {
                Console.WriteLine("\n\n=================================================");
                Console.WriteLine("🚜 PECUS CHAIN AGENT - SETUP");
                Console.WriteLine("=================================================");
                Console.Write("Enter your Farm Name to register: ");
                var farmName = Console.ReadLine();

                if (!string.IsNullOrWhiteSpace(farmName))
                {
                    farmId = await RegisterFarm(farmName, stoppingToken);
                    if (!string.IsNullOrEmpty(farmId))
                    {
                        Console.WriteLine($"✅ Registration SUCCESS! Your Farm ID is: {farmId}");
                        SaveFarmIdToConfig(farmId);
                    }
                }
            }
            else 
            {
                _logger.LogError("Cannot register farm in non-interactive mode without FARM_ID env var.");
                // For Docker demo purposes, we might want to auto-register a "Demo Farm" if none exists?
                // Let's keep it strict for now.
                return; 
            }
        }
        
        if (string.IsNullOrEmpty(farmId))
        {
             _logger.LogError("Startup aborted. No valid FARM_ID.");
             return;
        }

        _logger.LogInformation("Pecus Chain Agent Service Started. Farm ID: {FarmId}", farmId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try 
            {
                // Load config to check for changes (e.g. updated polling interval)
                var config = LoadConfig();
                int currentInterval = config?.PollingIntervalSeconds ?? PollingIntervalSeconds;
                string dbName = config?.DatabaseName ?? "DelPro";

                // 1. Check Sync Status from Cloud
                var status = await GetSyncStatus(farmId);
                long lastOid = status.last_oid;
                long lastAnimalOid = status.last_animal_oid;
                long lastLactationOid = status.last_lactation_oid;
                long lastDiversionOid = status.last_history_milk_diversion_oid;
                
                _logger.LogInformation("Cloud Watermarks - Sess: {S}, Anim: {A}, Lact: {L}, Div: {D}", lastOid, lastAnimalOid, lastLactationOid, lastDiversionOid);

                // 2. Fetch Data based on individual watermarks
                _logger.LogInformation("Sync Cycle: Fetching data... (Sess>{S}, Anim>{A}, Lact>{L}, Div>{D})", lastOid, lastAnimalOid, lastLactationOid, lastDiversionOid);
                var payload = FetchBatchData(farmId, lastOid, lastAnimalOid, lastLactationOid, lastDiversionOid, dbName);

                // 3. Upload
                await UploadData(payload, stoppingToken);

                // Wait before next cycle
                _logger.LogInformation("Waiting {Sec} seconds before next sync...", currentInterval);
                await Task.Delay(TimeSpan.FromSeconds(currentInterval), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Sync Cycle");
                await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken); // Retry sooner on error
            }
        }
    }

    private AgentConfig? LoadConfig()
    {
        try
        {
            if (File.Exists(ConfigFileName))
            {
                var json = File.ReadAllText(ConfigFileName);
                return JsonSerializer.Deserialize<AgentConfig>(json);
            }
        }
        catch (Exception ex) { _logger.LogWarning("Failed to load config file: {Msg}", ex.Message); }
        return null;
    }

    private string? LoadFarmIdFromConfig()
    {
        return LoadConfig()?.FarmId;
    }

    private async Task<SyncStatusResponse> GetSyncStatus(string farmId)
    {
        try
        {
            return await _httpClient.GetFromJsonAsync<SyncStatusResponse>($"{_apiBaseUrl}/api/sync/status?farm_id={farmId}");
        }
        catch (Exception ex)
        {
            _logger.LogError("Failed to contact Cloud API: {Message}", ex.Message);
            // Return empty status (LastOid = 0) to allow retry logic or fallback
            return new SyncStatusResponse(0, 0, 0, 0);
        }
    }

    private void SaveFarmIdToConfig(string farmId)
    {
        try
        {
            var config = new AgentConfig { FarmId = farmId };
            var json = JsonSerializer.Serialize(config);
            File.WriteAllText(ConfigFileName, json);
            _logger.LogInformation("Saved Farm ID to {File}", ConfigFileName);
        }
        catch (Exception ex) { _logger.LogError("Failed to save config file: {Msg}", ex.Message); }
    }

    private async Task<string?> RegisterFarm(string farmName, CancellationToken token)
    {
        try 
        {
            var request = new { name = farmName };
            var response = await _httpClient.PostAsJsonAsync($"{_apiBaseUrl}/api/v1/farms/register", request, token);
            
            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<FarmRegistrationResponse>(cancellationToken: token);
                return result?.farm_id;
            }
            else 
            {
                var err = await response.Content.ReadAsStringAsync(token);
                _logger.LogError("Registration Failed: {Status} - {Error}", response.StatusCode, err);
                return null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling registration API");
            return null;
        }
    }

    // RunSyncCycle method removed as logic is now in ExecuteAsync

    private async Task UploadData(IngestPayload payload, CancellationToken stoppingToken)
    {
        if (payload.basic_animals.Count == 0 && payload.sessions_milk_yield.Count == 0 && payload.lactations_summary.Count == 0 && payload.history_milk_diversion_info.Count == 0)
        {
            _logger.LogInformation("No new data to upload.");
            return;
        }

        _logger.LogInformation("Uploading batch: {Anim} Animals, {Lact} Lactations, {Sess} Sessions, {Div} Diversions...", 
            payload.basic_animals.Count, payload.lactations_summary.Count, payload.sessions_milk_yield.Count, payload.history_milk_diversion_info.Count);

        try 
        {
            var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = null }; 
            var response = await _httpClient.PostAsJsonAsync($"{_apiBaseUrl}/api/v1/ingest", payload, jsonOptions, stoppingToken);
            
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Upload SUCCESS.");
            }
            else
            {
                var error = await response.Content.ReadAsStringAsync(stoppingToken);
                _logger.LogError("Upload FAILED: {StatusCode} - {Error}", response.StatusCode, error);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during upload.");
        }
    }

    // --- DATA FETCHING ---
    private string GetConnectionString(string databaseName = "DelPro")
    {
        var connStr = _configuration.GetConnectionString("DelProDb");
        
        // If explicitly configured (e.g. Docker env var), use it.
        if (!string.IsNullOrEmpty(connStr)) return connStr;

        // If not configured, and we are on Windows, try Integrated Security (Production Mode)
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            _logger.LogInformation("No ConnectionString found. Detecting Windows OS... Using Integrated Security with DB: {DB}", databaseName);
            return $"Server=localhost;Database={databaseName};Integrated Security=SSPI;TrustServerCertificate=True;";
        }

        // Fallback for Linux/Mac without config (will likely fail, but better than nothing)
        return $"Server=localhost;Database={databaseName};User Id=sa;Password=PecusChain2025!;TrustServerCertificate=True;";
    }

    private IngestPayload FetchBatchData(string farmId, long lastSessionOid, long lastAnimalOid, long lastLactationOid, long lastHistoryMilkDiversionOid, string databaseName)
    {
        var connStr = GetConnectionString(databaseName);
        if (IsMockMode(connStr)) return FetchMockIncrementalBatch(farmId, lastSessionOid); // Reuse mock logic

        var animals = new List<DelproBasicAnimal>();
        var historyAnimals = new List<DelproHistoryAnimal>();
        var lactations = new List<DelproAnimalsLactationsSummary>();
        var sessions = new List<DelproSessionsMilkYield>();
        var voluntary = new List<DelproVoluntarySessionsMilkYield>();
        var diversions = new List<DelproHistoryMilkDiversionInfo>();

        try
        {
            using var conn = new SqlConnection(connStr);
            conn.Open();

            // 1. ANIMALS
            try 
            {
                // Logic: (ExitDate IS NULL) OR (ExitDate > 1 Year Ago)
                var oneYearAgo = DateTime.Now.AddYears(-1).ToString("yyyy-MM-dd");
                
                var sqlAnimals = $@"
                    SELECT TOP 2000 * FROM [{databaseName}].[dbo].[BasicAnimal] 
                    WHERE (ExitDate IS NULL OR ExitDate > '{oneYearAgo}') 
                    AND OID > @LastAnimalOID 
                    ORDER BY OID ASC";
                
                using (var cmd = new SqlCommand(sqlAnimals, conn))
                {
                    cmd.Parameters.AddWithValue("@LastAnimalOID", lastAnimalOid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read()) { animals.Add(MapAnimal(r)); }
                }

                // 1.1 HISTORY ANIMALS (Triggered by new BasicAnimals)
                if (animals.Any())
                {
                    try 
                    {
                        var newOids = animals.Select(a => a.OID).ToList();
                        var oidsStr = string.Join(",", newOids);
                        
                        var sqlHistory = $@"
                            SELECT * FROM [{databaseName}].[dbo].[HistoryAnimal] 
                            WHERE ReferenceID IN ({oidsStr})";

                        using (var cmdHist = new SqlCommand(sqlHistory, conn))
                        {
                            using var rHist = cmdHist.ExecuteReader();
                            while (rHist.Read()) { historyAnimals.Add(MapHistoryAnimal(rHist)); }
                        }
                        _logger.LogInformation("Fetched {Count} HistoryAnimal records for {AnimCount} new animals.", historyAnimals.Count, animals.Count);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning("Failed to fetch HistoryAnimal (Table might not exist?): {Msg}", ex.Message);
                    }
                }
            }
            catch (Exception ex) 
            { 
                _logger.LogWarning("Failed to fetch Basic Animals: {Msg}", ex.Message); 
            }

            // 2. LACTATIONS
            try 
            {
                var oneYearAgo = DateTime.Now.AddYears(-1).ToString("yyyy-MM-dd");
                var sqlLact = $@"
                    SELECT TOP 2000 L.* 
                    FROM [{databaseName}].[dbo].[AnimalLactationSummary] L
                    JOIN [{databaseName}].[dbo].[BasicAnimal] A ON L.Animal = A.OID
                    WHERE (A.ExitDate IS NULL OR A.ExitDate > '{oneYearAgo}')
                    AND L.OID > @LastLactationOID
                    ORDER BY L.OID ASC";
                    
                using (var cmd = new SqlCommand(sqlLact, conn))
                {
                    cmd.Parameters.AddWithValue("@LastLactationOID", lastLactationOid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read()) { lactations.Add(MapLactation(r)); }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to fetch Lactations: {Msg}", ex.Message);
            }

            // 3. SESSIONS (Normal)
            try
            {
                var oneYearAgo = DateTime.Now.AddYears(-1).ToString("yyyy-MM-dd");
                var fallbackDate = "2018-09-11";
                string sqlSessions;
                
                if (lastSessionOid == 0)
                {
                    var checkSql = $"SELECT TOP 1 1 FROM [{databaseName}].[dbo].[SessionMilkYield] WHERE BeginTime > '{oneYearAgo}'";
                    bool hasRecentData = false;
                    try {
                        using (var checkCmd = new SqlCommand(checkSql, conn))
                        {
                            hasRecentData = checkCmd.ExecuteScalar() != null;
                        }
                    } catch {}

                    var startDate = hasRecentData ? oneYearAgo : fallbackDate;
                    _logger.LogInformation("Session Sync Strategy: First Run. Starting from {Date} (HasRecentData: {Has})", startDate, hasRecentData);

                    sqlSessions = $@"
                        SELECT TOP 2000 * FROM [{databaseName}].[dbo].[SessionMilkYield] 
                        WHERE BeginTime > '{startDate}' 
                        ORDER BY OID ASC";
                }
                else
                {
                    sqlSessions = $"SELECT TOP 2000 * FROM [{databaseName}].[dbo].[SessionMilkYield] WHERE OID > @LastSessionOID ORDER BY OID ASC";
                }

                using (var cmd = new SqlCommand(sqlSessions, conn))
                {
                    if (lastSessionOid > 0) cmd.Parameters.AddWithValue("@LastSessionOID", lastSessionOid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read()) { sessions.Add(MapSession(r)); }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to fetch Sessions: {Msg}", ex.Message);
            }
            
            // 4. SESSIONS (Voluntary)
            if (sessions.Any())
            {
                try 
                {
                    var minOid = sessions.Min(s => s.OID);
                    var maxOid = sessions.Max(s => s.OID);
                    
                    string sqlVoluntary = $@"
                        SELECT * FROM [{databaseName}].[dbo].[VoluntarySessionMilkYield] 
                        WHERE OID >= @MinOID AND OID <= @MaxOID 
                        ORDER BY OID ASC";

                    using (var cmd = new SqlCommand(sqlVoluntary, conn))
                    {
                        cmd.Parameters.AddWithValue("@MinOID", minOid);
                        cmd.Parameters.AddWithValue("@MaxOID", maxOid);
                        
                        using var r = cmd.ExecuteReader();
                        while (r.Read()) { voluntary.Add(MapVoluntarySession(r)); }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Failed to fetch Voluntary Sessions: {Msg}", ex.Message);
                }
            }

            // 5. HISTORY MILK DIVERSION INFO
            try 
            {
                var sqlDiversion = $@"
                    SELECT TOP 2000 * FROM [{databaseName}].[dbo].[HistoryMilkDiversionInfo]
                    WHERE OID > @LastDiversionOID
                    ORDER BY OID ASC";

                using (var cmd = new SqlCommand(sqlDiversion, conn))
                {
                    cmd.Parameters.AddWithValue("@LastDiversionOID", lastHistoryMilkDiversionOid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read()) { diversions.Add(MapHistoryMilkDiversionInfo(r)); }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Could not fetch HistoryMilkDiversionInfo: {Msg}", ex.Message);
            }
        }
        catch (Exception ex) { _logger.LogError(ex, "SQL Connection/Critical Error"); } 

        return new IngestPayload(farmId, animals, lactations, sessions, voluntary, diversions, historyAnimals);
    }

    private bool IsMockMode(string? connStr) => string.IsNullOrEmpty(connStr) || connStr.Contains("Placeholder");

    // --- MAPPING HELPERS (Simplified) ---
    // Helper to safely convert nullable types
    private long? ToLong(object val) => (val == DBNull.Value || val == null) ? null : Convert.ToInt64(val);
    private int? ToInt(object val) => (val == DBNull.Value || val == null) ? null : Convert.ToInt32(val);
    private short? ToShort(object val) => (val == DBNull.Value || val == null) ? null : Convert.ToInt16(val);
    private decimal? ToDecimal(object val) => (val == DBNull.Value || val == null) ? null : Convert.ToDecimal(val);
    private bool? ToBool(object val) => (val == DBNull.Value || val == null) ? null : Convert.ToBoolean(val);
    private DateTime? ToDateTime(object val) => (val == DBNull.Value || val == null) ? null : Convert.ToDateTime(val);
    private string? ToString(object val) => (val == DBNull.Value || val == null) ? null : val.ToString();

    private DelproBasicAnimal MapAnimal(SqlDataReader r) => new DelproBasicAnimal(
        OID: Convert.ToInt64(r["OID"]),
        SystemEntryTimeStamp: ToDateTime(r["SystemEntryTimeStamp"]),
        Number: ToLong(r["Number"]),
        Name: ToString(r["Name"]),
        // ... (Map other fields as needed or use Dapper in production for less boilerplate)
        BirthDate: ToDateTime(r["BirthDate"]),
        Sex: ToInt(r["Sex"]),
        Type: ToInt(r["Type"]),
        Breed: ToInt(r["Breed"]),
        AnimalGuid: ToString(r["AnimalGuid"]),
        Comment: ToString(r["Comment"]),
        CommentDate: ToDateTime(r["CommentDate"]),
        ExitDate: ToDateTime(r["ExitDate"]),
        Modified: ToDateTime(r["Modified"]),
        PedigreeInfo: ToInt(r["PedigreeInfo"]),
        CalfSize: ToString(r["CalfSize"]),
        CalfHealthStatus: ToString(r["CalfHealthStatus"]),
        CalfUsage: ToString(r["CalfUsage"]),
        Group: ToInt(r["Group"]),
        TransponderID: ToLong(r["TransponderID"]),
        TransponderType: ToInt(r["TransponderType"]),
        EarTagLeft: ToLong(r["EarTagLeft"]),
        EarTagRight: ToLong(r["EarTagRight"]),
        BirthWeight: ToDecimal(r["BirthWeight"]),
        IsTwin: ToBool(r["IsTwin"]),
        BirthEvent: ToString(r["BirthEvent"]),
        ToBeCulled: ToBool(r["ToBeCulled"]),
        LatestHistoryIndex: ToLong(r["LatestHistoryIndex"]),
        OptimisticLockField: ToInt(r["OptimisticLockField"]),
        GCRecord: ToString(r["GCRecord"]),
        ObjectType: ToInt(r["ObjectType"]),
        ManualRationControl: ToBool(r["ManualRationControl"]),
        CurrentFeedTable: ToInt(r["CurrentFeedTable"]),
        ConsumptionRate: ToInt(r["ConsumptionRate"]),
        ActivitySetting: ToInt(r["ActivitySetting"]),
        BullID: ToString(r["BullID"]),
        ExitType: ToInt(r["ExitType"]),
        DrinkData: ToInt(r["DrinkData"]),
        MilkingTestAnimal: ToString(r["MilkingTestAnimal"]),
        HairColor: ToString(r["HairColor"]),
        MilkConfig: ToInt(r["MilkConfig"]),
        Imported: ToBool(r["Imported"]),
        Exported: ToBool(r["Exported"]),
        WeightIncreaseDecreaseStatus: ToString(r["WeightIncreaseDecreaseStatus"])
    );

    private DelproAnimalsLactationsSummary MapLactation(SqlDataReader r) => new DelproAnimalsLactationsSummary(
        OID: Convert.ToInt64(r["OID"]),
        SystemEntryTimeStamp: ToDateTime(r["SystemEntryTimeStamp"]),
        Animal: ToLong(r["Animal"]),
        LactationNumber: ToShort(r["LactationNumber"]),
        StartDate: ToDateTime(r["StartDate"]),
        EndDate: ToDateTime(r["EndDate"]),
        PeakYield: ToDecimal(r["PeakYield"]),
        DaysToPeak: ToShort(r["DaysToPeak"]),
        OptimisticLockField: ToShort(r["OptimisticLockField"]),
        GCRecord: ToString(r["GCRecord"]),
        MatureEquivalent: ToString(r["MatureEquivalent"]),
        HistoryTotalYield: ToDecimal(r["HistoryTotalYield"])
    );

    private DelproSessionsMilkYield MapSession(SqlDataReader r) => new DelproSessionsMilkYield(
        SessionNo: ToString(r["SessionNo"]) ?? "",
        TotalYield: ToDecimal(r["TotalYield"]),
        Destination: ToShort(r["Destination"]),
        User: ToString(r["User"]),
        ExpectedYield: ToDecimal(r["ExpectedYield"]),
        ObjectGuid: (r["ObjectGuid"] == DBNull.Value) ? null : (Guid?)r["ObjectGuid"],
        BeginTime: ToDateTime(r["BeginTime"]),
        BasicAnimal: ToLong(r["BasicAnimal"]),
        AnimalDaily: ToLong(r["AnimalDaily"]),
        EndTime: ToDateTime(r["EndTime"]),
        MilkingDevice: ToShort(r["MilkingDevice"]),
        PreviousEndTime: ToDateTime(r["PreviousEndTime"]),
        AvgConductivity: ToDecimal(r["AvgConductivity"]),
        MaxConductivity: ToDecimal(r["MaxConductivity"]),
        AverageConductivity7Days: ToDecimal(r["AverageConductivity7Days"]),
        RelativeConductivity: ToDecimal(r["RelativeConductivity"]),
        AverageBlood: ToDecimal(r["AverageBlood"]),
        MaxBlood: ToDecimal(r["MaxBlood"]),
        ModifiedSource: ToShort(r["ModifiedSource"]),
        SampleTube: ToShort(r["SampleTube"]),
        SampleTubeRack: ToShort(r["SampleTubeRack"]),
        SampleTubePosition: ToShort(r["SampleTubePosition"]),
        ObjectType: ToShort(r["ObjectType"]),
        OID: ToLong(r["OID"]),
        SystemEntryTimeStamp: ToDateTime(r["SystemEntryTimeStamp"])
    );

    private DelproVoluntarySessionsMilkYield MapVoluntarySession(SqlDataReader r) => new DelproVoluntarySessionsMilkYield(
        OID: Convert.ToInt64(r["OID"]),
        ExpectedRateLF: ToDecimal(r["ExpectedRateLF"]),
        ExpectedRateRF: ToDecimal(r["ExpectedRateRF"]),
        ExpectedRateLR: ToDecimal(r["ExpectedRateLR"]),
        ExpectedRateRR: ToDecimal(r["ExpectedRateRR"]),
        CarryoverLF: ToDecimal(r["CarryoverLF"]),
        CarryoverRF: ToDecimal(r["CarryoverRF"]),
        CarryoverLR: ToDecimal(r["CarryoverLR"]),
        CarryoverRR: ToDecimal(r["CarryoverRR"]),
        QuarterLFYield: ToDecimal(r["QuarterLFYield"]),
        QuarterRFYield: ToDecimal(r["QuarterRFYield"]),
        QuarterLRYield: ToDecimal(r["QuarterLRYield"]),
        QuarterRRYield: ToDecimal(r["QuarterRRYield"]),
        MilkType: ToShort(r["MilkType"]),
        Kickoff: ToShort(r["Kickoff"]),
        Incomplete: ToShort(r["Incomplete"]),
        NotMilkedTeats: ToShort(r["NotMilkedTeats"]),
        ConductivityLF: ToDecimal(r["ConductivityLF"]),
        ConductivityRF: ToDecimal(r["ConductivityRF"]),
        ConductivityLR: ToDecimal(r["ConductivityLR"]),
        ConductivityRR: ToDecimal(r["ConductivityRR"]),
        BloodLF: ToDecimal(r["BloodLF"]),
        BloodRF: ToDecimal(r["BloodRF"]),
        BloodLR: ToDecimal(r["BloodLR"]),
        BloodRR: ToDecimal(r["BloodRR"]),
        PeakFlowLF: ToDecimal(r["PeakFlowLF"]),
        PeakFlowRF: ToDecimal(r["PeakFlowRF"]),
        PeakFlowLR: ToDecimal(r["PeakFlowLR"]),
        PeakFlowRR: ToDecimal(r["PeakFlowRR"]),
        MeanFlowLF: ToDecimal(r["MeanFlowLF"]),
        MeanFlowRF: ToDecimal(r["MeanFlowRF"]),
        MeanFlowLR: ToDecimal(r["MeanFlowLR"]),
        MeanFlowRR: ToDecimal(r["MeanFlowRR"]),
        Occ: ToShort(r["Occ"]),
        Mdi: ToDecimal(r["Mdi"]),
        Performance: ToShort(r["Performance"]),
        CurrentCombinedAmd: ToDecimal(r["CurrentCombinedAmd"]),
        YieldExpectedLF: ToDecimal(r["YieldExpectedLF"]),
        YieldExpectedRF: ToDecimal(r["YieldExpectedRF"]),
        YieldExpectedLR: ToDecimal(r["YieldExpectedLR"]),
        YieldExpectedRR: ToDecimal(r["YieldExpectedRR"]),
        UdderCounter: ToShort(r["UdderCounter"]),
        UdderCounterFlags: ToShort(r["UdderCounterFlags"]),
        TeatCounterLF: ToShort(r["TeatCounterLF"]),
        TeatCounterLR: ToShort(r["TeatCounterLR"]),
        TeatCounterRF: ToShort(r["TeatCounterRF"]),
        TeatCounterRR: ToShort(r["TeatCounterRR"]),
        TeatCounterFlagsLF: ToShort(r["TeatCounterFlagsLF"]),
        TeatCounterFlagsLR: ToShort(r["TeatCounterFlagsLR"]),
        TeatCounterFlagsRF: ToShort(r["TeatCounterFlagsRF"]),
        TeatCounterFlagsRR: ToShort(r["TeatCounterFlagsRR"]),
        CleaningProgramNumber: ToShort(r["CleaningProgramNumber"]),
        DiversionReason: ToShort(r["DiversionReason"]),
        AmsSerialData: ToString(r["AmsSerialData"]),
        OccAverage: ToShort(r["OccAverage"]),
        EnabledTeats: ToShort(r["EnabledTeats"]),
        OccHealthClass: ToShort(r["OccHealthClass"]),
        OccEmr: ToShort(r["OccEmr"]),
        SelectiveTakeoffApplied: ToBool(r["SelectiveTakeoffApplied"]),
        AlternativeAttach: ToShort(r["AlternativeAttach"]),
        SmartPulsationRatio: ToShort(r["SmartPulsationRatio"]),
        TeatsFailedCleaning: ToShort(r["TeatsFailedCleaning"]),
        MilkFlowDuration: ToShort(r["MilkFlowDuration"])
    );

    private DelproHistoryMilkDiversionInfo MapHistoryMilkDiversionInfo(SqlDataReader r) => new DelproHistoryMilkDiversionInfo(
        OID: Convert.ToInt64(r["OID"]),
        Animal: ToLong(r["Animal"]),
        Group: ToInt(r["Group"]),
        LactationNumber: ToInt(r["LactationNumber"]),
        DivertDate: ToDateTime(r["DivertDate"]),
        DivertReason: ToInt(r["DivertReason"]),
        DivertedMilk: ToDecimal(r["DivertedMilk"]),
        DiversionCost: ToDecimal(r["DiversionCost"])
    );

    // --- MOCK IMPLEMENTATIONS ---
    private IngestPayload FetchMockInitialBatch(string farmId)
    {
        var animals = new List<DelproBasicAnimal>();
        // Mock 5 animals
        for(int i=0; i<5; i++) {
            animals.Add(new DelproBasicAnimal(
                OID: 1000+i, 
                SystemEntryTimeStamp: DateTime.UtcNow, 
                Number: 100+i, 
                Name: $"MockAnimal-{i}",
                BirthDate: DateTime.UtcNow.AddYears(-2),
                Sex: 2, Type: 1, Breed: 1,
                AnimalGuid: Guid.NewGuid().ToString(),
                Comment: "Initial Sync Mock",
                CommentDate: DateTime.UtcNow,
                ExitDate: null,
                Modified: DateTime.UtcNow,
                PedigreeInfo: 0, CalfSize: "Normal", CalfHealthStatus: "Healthy", CalfUsage: "None",
                Group: 1, TransponderID: 10000+i, TransponderType: 1, EarTagLeft: 20000+i, EarTagRight: 20000+i,
                BirthWeight: 40m, IsTwin: false, BirthEvent: "Normal", ToBeCulled: false,
                LatestHistoryIndex: 1, OptimisticLockField: 0, GCRecord: null, ObjectType: 1,
                ManualRationControl: false, CurrentFeedTable: 1, ConsumptionRate: 100, ActivitySetting: 1,
                BullID: null, ExitType: 0, DrinkData: 0, MilkingTestAnimal: "No", HairColor: "BW", MilkConfig: 1,
                Imported: false, Exported: false, WeightIncreaseDecreaseStatus: "Stable"
            ));
        }
        return new IngestPayload(farmId, animals, [], [], [], [], []);
    }

    private IngestPayload FetchMockIncrementalBatch(string farmId, long lastOid)
    {
        var sessions = new List<DelproSessionsMilkYield>();
        var rnd = new Random();
        if (rnd.Next(0, 10) < 3) return new IngestPayload(farmId, [], [], [], [], [], []);

        long startOid = lastOid + 1;
        for(int i=0; i<3; i++) {
             sessions.Add(new DelproSessionsMilkYield(
                SessionNo: Guid.NewGuid().ToString(),
                OID: startOid + i,
                SystemEntryTimeStamp: DateTime.UtcNow,
                TotalYield: (decimal)(20 + rnd.NextDouble() * 10),
                BeginTime: DateTime.UtcNow.AddMinutes(-20),
                EndTime: DateTime.UtcNow,
                User: "MockDevice",
                Destination: 1, ExpectedYield: 25m, ObjectGuid: Guid.NewGuid(),
                BasicAnimal: 1000 + rnd.Next(0,5), AnimalDaily: 1, MilkingDevice: 1,
                PreviousEndTime: DateTime.UtcNow.AddHours(-10),
                AvgConductivity: 4.0m, MaxConductivity: 4.5m, AverageConductivity7Days: 4.1m, RelativeConductivity: 100m,
                AverageBlood: 0m, MaxBlood: 0m, ModifiedSource: 0, SampleTube: 0, SampleTubeRack: 0, SampleTubePosition: 0, ObjectType: 1
            ));
        }
        return new IngestPayload(farmId, [], [], sessions, [], [], []);
    }
}

// --- DATA MODELS ---
// (Keep existing records exactly as they are)
public record DelproBasicAnimal(
    long OID,
    DateTime? SystemEntryTimeStamp,
    long? Number,
    string? AnimalGuid,
    string? Name,
    int? Type,
    int? Sex,
    int? Breed,
    DateTime? BirthDate,
    string? Comment,
    DateTime? CommentDate,
    DateTime? ExitDate,
    DateTime? Modified,
    int? PedigreeInfo,
    string? CalfSize,
    string? CalfHealthStatus,
    string? CalfUsage,
    int? Group,
    long? TransponderID,
    int? TransponderType,
    long? EarTagLeft,
    long? EarTagRight,
    decimal? BirthWeight,
    bool? IsTwin,
    string? BirthEvent,
    bool? ToBeCulled,
    long? LatestHistoryIndex,
    int? OptimisticLockField,
    string? GCRecord,
    int? ObjectType,
    bool? ManualRationControl,
    int? CurrentFeedTable,
    int? ConsumptionRate,
    int? ActivitySetting,
    string? BullID,
    int? ExitType,
    int? DrinkData,
    string? MilkingTestAnimal,
    string? HairColor,
    int? MilkConfig,
    bool? Imported,
    bool? Exported,
    string? WeightIncreaseDecreaseStatus
);

public record DelproAnimalsLactationsSummary(
    long OID,
    DateTime? SystemEntryTimeStamp,
    long? Animal,
    short? LactationNumber,
    DateTime? StartDate,
    DateTime? EndDate,
    decimal? PeakYield,
    short? DaysToPeak,
    short? OptimisticLockField,
    string? GCRecord,
    string? MatureEquivalent,
    decimal? HistoryTotalYield
);

public record DelproSessionsMilkYield(
    string SessionNo,
    decimal? TotalYield,
    short? Destination,
    string? User,
    decimal? ExpectedYield,
    Guid? ObjectGuid,
    DateTime? BeginTime,
    long? BasicAnimal,
    long? AnimalDaily,
    DateTime? EndTime,
    short? MilkingDevice,
    DateTime? PreviousEndTime,
    decimal? AvgConductivity,
    decimal? MaxConductivity,
    decimal? AverageConductivity7Days,
    decimal? RelativeConductivity,
    decimal? AverageBlood,
    decimal? MaxBlood,
    short? ModifiedSource,
    short? SampleTube,
    short? SampleTubeRack,
    short? SampleTubePosition,
    short? ObjectType,
    long? OID,
    DateTime? SystemEntryTimeStamp
);

public record DelproVoluntarySessionsMilkYield(
    long OID,
    decimal? ExpectedRateLF,
    decimal? ExpectedRateRF,
    decimal? ExpectedRateLR,
    decimal? ExpectedRateRR,
    decimal? CarryoverLF,
    decimal? CarryoverRF,
    decimal? CarryoverLR,
    decimal? CarryoverRR,
    decimal? QuarterLFYield,
    decimal? QuarterRFYield,
    decimal? QuarterLRYield,
    decimal? QuarterRRYield,
    short? MilkType,
    short? Kickoff,
    short? Incomplete,
    short? NotMilkedTeats,
    decimal? ConductivityLF,
    decimal? ConductivityRF,
    decimal? ConductivityLR,
    decimal? ConductivityRR,
    decimal? BloodLF,
    decimal? BloodRF,
    decimal? BloodLR,
    decimal? BloodRR,
    decimal? PeakFlowLF,
    decimal? PeakFlowRF,
    decimal? PeakFlowLR,
    decimal? PeakFlowRR,
    decimal? MeanFlowLF,
    decimal? MeanFlowRF,
    decimal? MeanFlowLR,
    decimal? MeanFlowRR,
    short? Occ,
    decimal? Mdi,
    short? Performance,
    decimal? CurrentCombinedAmd,
    decimal? YieldExpectedLF,
    decimal? YieldExpectedRF,
    decimal? YieldExpectedLR,
    decimal? YieldExpectedRR,
    short? UdderCounter,
    short? UdderCounterFlags,
    short? TeatCounterLF,
    short? TeatCounterLR,
    short? TeatCounterRF,
    short? TeatCounterRR,
    short? TeatCounterFlagsLF,
    short? TeatCounterFlagsLR,
    short? TeatCounterFlagsRF,
    short? TeatCounterFlagsRR,
    short? CleaningProgramNumber,
    short? DiversionReason,
    string? AmsSerialData,
    short? OccAverage,
    short? EnabledTeats,
    short? OccHealthClass,
    short? OccEmr,
    bool? SelectiveTakeoffApplied,
    short? AlternativeAttach,
    short? SmartPulsationRatio,
    short? TeatsFailedCleaning,
    short? MilkFlowDuration
);

public record DelproHistoryMilkDiversionInfo(
    long OID,
    long? Animal,
    int? Group,
    int? LactationNumber,
    DateTime? DivertDate,
    int? DivertReason,
    decimal? DivertedMilk,
    decimal? DiversionCost
);

public class AgentConfig
{
    public string? FarmId { get; set; }
    public string? DatabaseName { get; set; } = "DelPro";
    public int PollingIntervalSeconds { get; set; } = 1800; // Default 30 min
}

public record IngestPayload(
    string farm_id,
    List<DelproBasicAnimal> basic_animals,
    List<DelproAnimalsLactationsSummary> lactations_summary,
    List<DelproSessionsMilkYield> sessions_milk_yield,
    List<DelproVoluntarySessionsMilkYield> voluntary_sessions_milk_yield,
    List<DelproHistoryMilkDiversionInfo> history_milk_diversion_info,
    List<DelproHistoryAnimal> history_animals
);

public record SyncStatusResponse(long last_oid, long last_animal_oid, long last_lactation_oid, long last_history_milk_diversion_oid);

public record FarmRegistrationResponse(string farm_id, string name, DateTime created_at);
