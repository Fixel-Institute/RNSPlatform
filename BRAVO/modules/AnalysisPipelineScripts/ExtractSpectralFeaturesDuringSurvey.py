from Server import models

import os, sys
from pathlib import Path
import datetime, pytz
import pickle
import numpy as np
from scipy import stats, signal
import subprocess

from modules import DataAnalysis, Database, DataCurator
from modules.HelperFunctions import utc_offset_to_timezone

DATABASE_PATH = os.environ.get('DATASERVER_PATH')

AnalysisScriptType = "ExtractSpectralFeaturesDuringSurvey"
AnalysisMethodVersion = "1.0.0"

def HandleRefreshAnalysis():
    Participants = [participant.get_info() for participant in models.Participant.find_all()]
    source_file = models.SourceFile.find(type=AnalysisScriptType, metadata={
        "User": "Admin",
        "Version": AnalysisMethodVersion
    })
    if not source_file:
        source_file = models.SourceFile.create(type=AnalysisScriptType, metadata={
            "User": "Admin",
            "Version": AnalysisMethodVersion
        })
        source_file.name = AnalysisScriptType
        source_file.pointer = DATABASE_PATH + "cache" + os.path.sep + source_file.name + ".bpkl"
        hashed = Database.saveSourceFile([], source_file.pointer)
        source_file.hashed = hashed
        source_file.save()

    if not "Version" in source_file.metadata:
        source_file.metadata["Version"] = AnalysisMethodVersion
        source_file.save()

    RecordingCollections = []

    def checkHistory(items, newItem):
        for item in items:
            if item["ParticipantId"] == newItem["ParticipantId"] and item["Date"] == newItem["Date"] and item["Contact"] == newItem["Contact"]:
                return True
        return False

    userConfig, _ = Database.retrieveProcessingSettings({"ProcessingConfiguration": {
        "TimeSeriesRecording": {
            "StandardFilter": {
                "value": "Butterworth 1-100Hz"
            },
            "CardiacFilter": {
                "value": "No Filter"
            },
            "SpectrogramMethod": {
                "value": "Welch's Periodogram"
            }
        }
    }})
    userConfig["APIAccess"] = True

    def MovingAverageFilter(signal, window_size):
        window = np.ones(window_size) / window_size
        return np.convolve(signal, window, mode='same')

    def ExtractAperiodicComponents(Frequency, Power):
        FrequencySelection = ((Frequency > 55) & (Frequency < 90)) | ((Frequency > 30) & (Frequency < 40)) 
        YData = np.log10(Power[FrequencySelection])
        XData = np.log10(Frequency[FrequencySelection])
        coe = np.polyfit(XData, YData, 1)
        AperiodicBaseline = np.polyval(coe, np.log10(Frequency))
        for j in range(len(AperiodicBaseline)):
            if np.isnan(AperiodicBaseline[-j-1]):
                AperiodicBaseline[-j-1] = AperiodicBaseline[-j]
        AperiodicBaseline = np.power(10,AperiodicBaseline)
        return AperiodicBaseline
    
    def ExtractFTGPeak(Frequency, Power):
        FrequencySelection = ((Frequency > 55) & (Frequency < 95))
        GammaBand = Power[FrequencySelection,:]
        GammaFluctuation = signal.detrend(np.mean(GammaBand, axis=1), type="linear")
        GammaCI = np.zeros((GammaBand.shape[0],2))
        for i in range(GammaBand.shape[0]):
            GammaCI[i,:] = stats.t.interval(0.95, len(GammaFluctuation)-1, loc=GammaFluctuation[i], scale=np.std(GammaFluctuation))
        
        MaxGammaIndex = np.argmax(GammaCI[:,1])
        GammaParameters = {"MaxGamma": GammaCI[MaxGammaIndex,:], "GammaFrequency": Frequency[FrequencySelection][MaxGammaIndex], "Significant": False}

        GammaDetection = np.array(GammaCI[MaxGammaIndex,0] > GammaFluctuation, dtype=float)
        StartPeak = np.where(np.diff(GammaDetection) == -1)[0]
        EndPeak = np.where(np.diff(GammaDetection) == 1)[0]
        if len(StartPeak) == 1 and len(EndPeak) == 1 and GammaCI[MaxGammaIndex,1] > 2:
            GammaParameters["PeakStart"] = Frequency[FrequencySelection][StartPeak[0]]
            GammaParameters["PeakEnd"] = Frequency[FrequencySelection][EndPeak[0]]
            GammaParameters["Significant"] = True
        return GammaParameters

    for participant in Participants:
        Data = DataAnalysis.queryAvailableAnalyses(participant["Id"], "TimeSeriesAnalysis")
        Data["Recordings"].sort(key=lambda x: x["Date"])
        ChannelsIncluded = []
        for i in range(len(Data["Recordings"])):
            if Data["Recordings"][i]["Timezone"] == "":
                Data["Recordings"][i]["Timezone"] = "UTC-04:00"
            RecordingDate = datetime.datetime.fromtimestamp(Data["Recordings"][i]["Date"]).astimezone(utc_offset_to_timezone(Data["Recordings"][i]["Timezone"])).strftime("%Y-%m-%d")
            Data["Recordings"][i]["LocalDate"] = RecordingDate

            if "DBS Snapshots" == Data["Recordings"][i]["Type"]:
                ToLoad = True
                for j in range(len(Data["Recordings"][i]["Metadata"]["ChannelNames"])):
                    if not Data["Recordings"][i]["Metadata"]["ChannelNames"][j] in ChannelsIncluded:
                        ToLoad = True

                if not ToLoad:
                    continue 

                Analysis = DataAnalysis.processTimeseriesAnalysis(participant["Id"], Data["Recordings"][i]["Id"], userConfig)
                for recording in Analysis["Signal"]:
                    for j in range(len(recording["SignalSeries"]["ChannelNames"])):
                        if Data["Recordings"][i]["Metadata"]["ChannelNames"][j] in ChannelsIncluded:
                            continue
                        ChannelsIncluded.append(Data["Recordings"][i]["Metadata"]["ChannelNames"][j])

                        collection = {
                            "ParticipantId": participant["Id"],
                            "Diagnosis": participant["Diagnosis"],
                            "Contact": Data["Recordings"][i]["Metadata"]["ChannelNames"][j],
                            "Date": RecordingDate,
                        }

                        if not checkHistory(RecordingCollections, collection):
                            MeanPSD = np.nanmedian(Analysis["Signal"][0]["SignalSeries"]["Spectrum"][j]["Power"],axis=1)

                            if np.any(np.isnan(MeanPSD)):
                                continue

                            StdPSD = np.nanstd(Analysis["Signal"][0]["SignalSeries"]["Spectrum"][j]["Power"],axis=1)
                            if np.any(StdPSD == 0):
                                continue 
                            
                            MeanPSD = MovingAverageFilter(MeanPSD, 5)
                            AperiodicComponent = ExtractAperiodicComponents(Analysis["Signal"][0]["SignalSeries"]["Spectrum"][j]["Frequency"], MeanPSD)

                            NormalizedSpectrum = Analysis["Signal"][0]["SignalSeries"]["Spectrum"][j]["Power"] / AperiodicComponent.reshape(-1,1)
                            GammaParameters = ExtractFTGPeak(Analysis["Signal"][0]["SignalSeries"]["Spectrum"][j]["Frequency"], NormalizedSpectrum)

                            collection = {
                                "ParticipantId": participant["Id"],
                                "Diagnosis": participant["Diagnosis"],
                                "Contact": Data["Recordings"][i]["Metadata"]["ChannelNames"][j],
                                "Date": RecordingDate,
                                "PowerSpectrum": MeanPSD,
                                "StdPower": StdPSD,
                                "Frequency": Analysis["Signal"][0]["SignalSeries"]["Spectrum"][j]["Frequency"],
                                "AperiodicComponent": AperiodicComponent,
                                "FTGStats": GammaParameters
                            }
                            RecordingCollections.append(collection)

    hashed = Database.saveSourceFile(RecordingCollections, source_file.pointer)
    source_file.metadata["Version"] = AnalysisMethodVersion
    source_file.hashed = hashed
    source_file.save()

def QueryAnalysisResultTable(Participants):
    source_file = models.SourceFile.find(type=AnalysisScriptType, metadata={
        "User": "Admin",
        "Version": AnalysisMethodVersion
    })
    if not source_file:
        return {"Participants": Participants, "RecordingCollection": []}

    RecordingCollections = Database.loadSourceFile(source_file.pointer, source_file.hashed)
    ParticipantIds = [participant["Id"] for participant in Participants]

    RecordingCollections = [collection for collection in RecordingCollections if collection["ParticipantId"] in ParticipantIds]
    
    Participants = sorted(Participants, key=lambda x: x["Name"])
    ResultTable = {"Participants": Participants, "RecordingCollection": []}
    for collection in RecordingCollections:
        ResultTable["RecordingCollection"].append({
            "ParticipantId": collection["ParticipantId"],
            "Date": collection["Date"],
            "Contact": collection["Contact"],
            "FTGStats": collection["FTGStats"]
        })
        
    return ResultTable

def QueryAnalysisResultFullTable(Participants):
    source_file = models.SourceFile.find(type=AnalysisScriptType, metadata={
        "User": "Admin",
        "Version": AnalysisMethodVersion
    })
    if not source_file:
        return {"Participants": Participants, "RecordingCollection": []}

    RecordingCollections = Database.loadSourceFile(source_file.pointer, source_file.hashed)
    ParticipantIds = [participant["Id"] for participant in Participants]
    RecordingCollections = [collection for collection in RecordingCollections if collection["ParticipantId"] in ParticipantIds]
    
    Participants = sorted(Participants, key=lambda x: x["Name"])
    ResultTable = {"Participants": Participants, "RecordingCollection": []}
    for collection in RecordingCollections:
        ResultTable["RecordingCollection"].append({
            "ParticipantId": collection["ParticipantId"],
            "Date": collection["Date"],
            "Contact": collection["Contact"],
            "CenterFrequency": collection["CenterFrequency"] if "CenterFrequency" in collection.keys() else [],
            "PredictedCenterFrequency": collection["PredictedCenterFrequency"] if "PredictedCenterFrequency" in collection.keys() else [],
            "PSD": collection["PowerSpectrum"],
            "StdPower": collection["StdPower"],
            "Frequency": collection["Frequency"],
        })
        
    return ResultTable

def QueryAnalysisResultPSD(ParticipantId, Contact):
    source_file = models.SourceFile.find(type=AnalysisScriptType, metadata={
        "User": "Admin",
        "Version": AnalysisMethodVersion
    })
    if not source_file:
        return []

    RecordingCollections = Database.loadSourceFile(source_file.pointer, source_file.hashed)
    RecordingCollections = [collection for collection in RecordingCollections if collection["ParticipantId"] == ParticipantId]
    
    Result = []
    for collection in RecordingCollections:
        if collection["Date"] + " " + collection["Contact"] == Contact:
            Result = collection
        
    return Result

def SetExpertLabel(ParticipantId, Date, Contact, Label):
    source_file = models.SourceFile.find(type=AnalysisScriptType, metadata={
        "User": "Admin",
        "Version": AnalysisMethodVersion
    })
    if not source_file:
        return False

    RecordingCollections = Database.loadSourceFile(source_file.pointer, source_file.hashed)
    for collection in RecordingCollections:
        if collection["ParticipantId"] == ParticipantId and collection["Date"] == Date and collection["Contact"] == Contact:
            collection["CenterFrequency"] = Label
            break

    hashed = Database.saveSourceFile(RecordingCollections, source_file.pointer)
    source_file.hashed = hashed
    source_file.save()
    return True

def QueryAnalysisResultRaw(Participants):
    source_file = models.SourceFile.find(type=AnalysisScriptType, metadata={
        "User": "Admin",
        "Version": AnalysisMethodVersion
    })
    if not source_file:
        return []

    ParticipantIds = [participant["Id"] for participant in Participants]
    RecordingCollections = Database.loadSourceFile(source_file.pointer, source_file.hashed)
    RecordingCollections = [collection for collection in RecordingCollections if collection["ParticipantId"] in ParticipantIds]
    
    return pickle.dumps(RecordingCollections)

def CommandLineAsyncUpdate():
    script_path = str(Path(__file__).resolve().parent) + "/AnalysisPipeline.py"
    subprocess.Popen([sys.executable, script_path, "ExtractSpectralFeaturesDuringSurvey"], cwd=Path(__file__).resolve().parent, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True

def UpdateSavedData():
    source_file = models.SourceFile.find(type=AnalysisScriptType, metadata={
        "User": "Admin",
        "Version": AnalysisMethodVersion
    })

    with open("C:\\Backup\\UFL Dropbox\\Jackson Cagle\\SpectralAnalysisExaminationSurvey_Updated2.pkl", "rb") as f:
        RecordingCollections = pickle.load(f)

    for i in range(len(RecordingCollections)):
        RecordingCollections[i]["CenterFrequency"] = []

    hashed = Database.saveSourceFile(RecordingCollections, source_file.pointer)
    source_file.metadata["Version"] = AnalysisMethodVersion
    source_file.hashed = hashed
    source_file.save()