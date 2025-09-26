""""""
"""
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
"""
"""
Medtronic Percept BrainSense Event Logs Module
===================================================
@author: Jackson Cagle, University of Florida
@email: jackson.cagle@neurology.ufl.edu
"""

import os
from datetime import datetime
import copy
import numpy as np
import pandas as pd

from modules import Therapy, Database
from modules.utility.PythonUtility import rangeSelection

key = os.environ.get('DATASERVER_ENCRYPTION')

def saveChronicBrainSense(ChronicLFPs):
    """ Save Chronic BrainSense Data in Database Storage

    Args:
      deviceID: UUID4 deidentified id for each unique Percept device.
      ChronicLFPs: Chronic BrainSense (Power-band) structures extracted from Medtronic JSON file.
      sourceFile: filename of the raw JSON file that the original data extracted from.

    Returns:
      Boolean indicating if new data is found (to be saved).
    """

    NewRecordings = []
    for key in ChronicLFPs.keys():
        if key == "HemisphereLocationDef.Right": 
            hemisphere = "RightHemisphere"
        else:
            hemisphere = "LeftHemisphere"

        Time = np.array([t.timestamp() for t in ChronicLFPs[key]["DateTime"]])
        Amplitude = ChronicLFPs[key]["Amplitude"]
        LFP = ChronicLFPs[key]["LFP"]

        Recording = dict()
        Recording["SamplingRate"] = -1 # Variable Frequency
        Recording["Time"] = Time
        Recording["Data"] = np.zeros((len(Recording["Time"]),2))
        Recording["Data"][:,0] = LFP
        Recording["Data"][:,1] = Amplitude
        Recording["ChannelNames"] = [hemisphere + " LFP", hemisphere + " Amplitude"]
        Recording["StartTime"] = Recording["Time"][0]
        Recording["Duration"] = Recording["Time"][-1] - Recording["Time"][0]
        NewRecordings.append(Recording)

    return NewRecordings

def extractTherapyString(note):
    try:
        TherapyString = str(int(note["Stimulation"]["Frequency"])) + "Hz " + str(int(note["Stimulation"]["Pulsewidth"])) + "" + note["Stimulation"]["PulsewidthUnit"]

        if note["Stimulation"]["ReturnContact"] == ["CAN"]:
            TherapyString += " [" + "|".join(note["Stimulation"]["Contact"]) + "]"
        else:
            TherapyString += " [" + " ".join(note["Stimulation"]["Contact"]) + " => " + " ".join(note["Stimulation"]["ReturnContact"]) + "]"
        return TherapyString
    except Exception as e:
        return "Unknown"
    
def extractSensingString(note):
    try:
        if "Bypass" in note["Adaptive"]["StimulationConfiguration"]["Config"].keys():
            return str(note["Adaptive"]["RecordingConfiguration"]["Config"]["SensingSetup"]["FrequencyInHertz"]) + "Hz Bypassed"
        else:
            return str(note["Adaptive"]["RecordingConfiguration"]["Config"]["SensingSetup"]["FrequencyInHertz"]) + "Hz"
    except Exception as e:
        return "Unknown"

def checkExistingSegments(segments, params):
    for i in range(len(segments)):
        if segments[i]["TherapyWindow"] == params["TherapyWindow"]:
            if segments[i]["TherapyNote"] == params["TherapyNote"]:
                if segments[i]["RecordingString"] == params["RecordingString"]:
                    if segments[i]["Device"] == params["Device"]:
                        if segments[i]["ChannelNames"] == params["ChannelNames"]:
                            return i
    return -1

def extractChronicNeuralActivity(participant, devices, recordings, config):
    DBSDeviceDict = {}
    for i in range(len(devices)):
        if not devices[i].serial_number in DBSDeviceDict.keys():
            DBSDeviceDict[devices[i].serial_number] = []
        DBSDeviceDict[devices[i].serial_number].append(devices[i])

    TherapyHistory = Therapy.queryTherapyHistory(participant)
    TherapyTimeline = Therapy.createTherapyTimeline(TherapyHistory)

    ChronicNeuralActivity = []
    for key in DBSDeviceDict.keys():
        LeadCount = 0
        DBSDeviceIds = []
        for i in range(len(DBSDeviceDict[key])):
            DeviceInfoTemp = DBSDeviceDict[key][i].get_info()
            DBSDeviceIds.append(DeviceInfoTemp["Id"])
            if len(DeviceInfoTemp["Electrodes"]) > LeadCount:
                LeadCount = len(DeviceInfoTemp["Electrodes"])
                DBSDevice = {**DeviceInfoTemp}
        
        TimelineDataframe = pd.DataFrame({"Time": []})
        for recording in recordings:
            if not recording.source.metadata["Device"] in DBSDeviceIds:
                continue
            Data = Database.loadSourceFile(recording.pointer, recording.hashed)
            RecordingDF = {"Time": Data["Time"]}
            for i in range(len(Data["ChannelNames"])):
                if not Data["ChannelNames"][i] in TimelineDataframe.columns:
                    TimelineDataframe[Data["ChannelNames"][i]] = np.nan
                RecordingDF[Data["ChannelNames"][i]] = Data["Data"][:,i]
            RecordingDF = pd.DataFrame(RecordingDF)
            TimelineDataframe = pd.concat([TimelineDataframe, pd.DataFrame(RecordingDF)], ignore_index=True)

        TimelineDataframe.drop_duplicates(inplace=True)
        TimelineDataframe = TimelineDataframe.groupby("Time", as_index=False).first()
        TimelineDataframe.sort_values(by="Time", inplace=True)
        TimelineDataframe.reset_index(inplace=True, drop=True)

        for i in range(len(TherapyHistory["TherapyModification"])):
            if TherapyHistory["TherapyModification"][i]["Device"]["Id"] in DBSDeviceIds:
                TherapyHistory["TherapyModification"][i]["History"] = [x for x in TherapyHistory["TherapyModification"][i]["History"] if x["Type"] == "TherapyChangeGroup"]
                TherapyHistory["TherapyModification"][i]["History"].sort(key=lambda x: x["Date"])
                Timestamps = [event["Date"] for event in TherapyHistory["TherapyModification"][i]["History"]]

                for j in range(1, len(Timestamps)):
                    # TODO: Make it less specific to Percept
                    GroupId = TherapyHistory["TherapyModification"][i]["History"][j-1]["New"]
                    DataSelected = TimelineDataframe.loc[(TimelineDataframe["Time"] > Timestamps[j-1]) & (TimelineDataframe["Time"] < Timestamps[j])]
                    
                    if len(DataSelected) > 0:
                        TherapyNote = {}
                        for k in range(len(TherapyTimeline)):
                            if len(TherapyNote.keys()) == 0:
                                if TherapyTimeline[k]["Date"] > Timestamps[j-1]:
                                    for therapy in TherapyTimeline[k]["DefinedTherapies"]:
                                        if therapy["GroupId"] == GroupId:
                                            TherapyNote = copy.deepcopy(therapy)

                        if len(TherapyNote.keys()) == 0:
                            continue
                        
                        for leadId in range(len(TherapyNote["StimulationSettings"])):
                            TherapyNote["StimulationSettings"][leadId] = TherapyNote["StimulationSettings"][leadId]["Pre"] if len(TherapyNote["StimulationSettings"][leadId]["Pre"].keys()) > 0 else TherapyNote["StimulationSettings"][leadId]["Summary"]
                            TherapyNote["AdaptiveSettings"][leadId] = TherapyNote["AdaptiveSettings"][leadId]["Pre"] if len(TherapyNote["AdaptiveSettings"][leadId]["Pre"].keys()) > 0 else TherapyNote["AdaptiveSettings"][leadId]["Summary"]

                        ChannelNames = list(TimelineDataframe.columns)
                        ChannelNames.remove("Time")
                        Activity = {
                            "Device": DBSDevice["Id"],
                            "TherapyWindow": [float(Timestamps[j-1]), float(Timestamps[j])],
                            "Description": [],
                            "TherapyNote": TherapyNote,
                            "TherapyString": [],
                            "RecordingString": [],
                            "Time": DataSelected["Time"].tolist(),
                            "ChannelNames": copy.deepcopy(ChannelNames),
                            "ChannelNamesFix": copy.deepcopy(ChannelNames),
                            "ChannelUnits": ["" if x.endswith("LFP") else "mA" for x in ChannelNames],
                            "Data": DataSelected[ChannelNames].to_numpy().T
                        }
                        for k in range(len(Activity["ChannelNames"])):
                            mean = np.nanmean(Activity["Data"][k,:])
                            std = np.nanstd(Activity["Data"][k,:])
                            while True:
                                outlier_idx = np.where(Activity["Data"][k,:] > mean + 6*std)[0]
                                if len(outlier_idx) == 0:
                                    break
                                for idx in outlier_idx:
                                    if 0 < idx < len(Activity["Data"][k,:]) - 1:
                                        Activity["Data"][k,idx] = np.nanmean([Activity["Data"][k,idx-1], Activity["Data"][k,idx+1]])
                                    elif idx == 0:
                                        Activity["Data"][k,idx] = Activity["Data"][k,idx+1]
                                    else:
                                        Activity["Data"][k,idx] = Activity["Data"][k,idx-1]

                        for lead in DBSDevice["Electrodes"]:
                            for k in range(len(Activity["ChannelNames"])):
                                if Activity["ChannelNames"][k].startswith("LeftHemisphere") and lead["Target"].startswith("Left"):
                                    Activity["ChannelNamesFix"][k] = Activity["ChannelNames"][k].replace("LeftHemisphere", lead["CustomName"])
                                elif Activity["ChannelNames"][k].startswith("RightHemisphere") and lead["Target"].startswith("Right"):
                                    Activity["ChannelNamesFix"][k] = Activity["ChannelNames"][k].replace("RightHemisphere", lead["CustomName"])

                        for k in range(len(Activity["ChannelNames"])):
                            Description = {}
                            for leadId in range(len(TherapyNote["StimulationSettings"])):
                                if "Electrode" in TherapyNote["StimulationSettings"][leadId].keys() and TherapyNote["StimulationSettings"][leadId]["Electrode"]["Target"].startswith(Activity["ChannelNames"][k].split("Hemisphere")[0]):
                                    if type(TherapyNote["StimulationSettings"][leadId]["Frequency"]) == list:
                                        TherapyNote["StimulationSettings"][leadId]["Frequency"] = "{" + "|".join([f["Value"] for f in TherapyNote["StimulationSettings"][leadId]["Frequency"]]) + "}"
                                    if type(TherapyNote["StimulationSettings"][leadId]["Pulsewidth"]) == list:
                                        TherapyNote["StimulationSettings"][leadId]["Pulsewidth"] = "{" + "|".join([str(int(f["Value"])) for f in TherapyNote["StimulationSettings"][leadId]["Pulsewidth"]]) + "}"
                                    if type(TherapyNote["StimulationSettings"][leadId]["Contact"][0]) == dict:
                                        TherapyNote["StimulationSettings"][leadId]["Contact"] = "{" + "|".join([str(f["Value"]) for f in TherapyNote["StimulationSettings"][leadId]["Contact"]]) + "}"
                                    if TherapyNote["StimulationSettings"][leadId]["ReturnContact"] == ["CAN"]:
                                        TherapyString = str(TherapyNote["StimulationSettings"][leadId]["Frequency"]) + "Hz " + str(TherapyNote["StimulationSettings"][leadId]["Pulsewidth"]) + TherapyNote["StimulationSettings"][leadId]["PulsewidthUnit"] + " [" + "|".join(TherapyNote["StimulationSettings"][leadId]["Contact"]) + "]"

                                    Description["Stimulation"] = TherapyString
                                    if "RecordingConfiguration" in TherapyNote["AdaptiveSettings"][leadId].keys():
                                        if "SensingSetup" in TherapyNote["AdaptiveSettings"][leadId]["RecordingConfiguration"]["Config"].keys():
                                            if "FrequencyInHertz" in TherapyNote["AdaptiveSettings"][leadId]["RecordingConfiguration"]["Config"]["SensingSetup"].keys():
                                                if type(TherapyNote["AdaptiveSettings"][leadId]["RecordingConfiguration"]["Config"]["SensingSetup"]["FrequencyInHertz"]) == list:
                                                    Description["Bypass"] = False
                                                    Description["SensingFrequency"] = "{" + "|".join([str(f) + " Hz" for f in TherapyNote["AdaptiveSettings"][leadId]["RecordingConfiguration"]["Config"]["SensingSetup"]["FrequencyInHertz"]]) + "}"
                                                else:
                                                    Description["Bypass"] = False
                                                    Description["SensingFrequency"] = str(TherapyNote["AdaptiveSettings"][leadId]["RecordingConfiguration"]["Config"]["SensingSetup"]["FrequencyInHertz"]) + " Hz"
                                                    if "Bypass" in TherapyNote["AdaptiveSettings"][leadId]["RecordingConfiguration"]["Config"]["SensingSetup"].keys():
                                                        Description["Bypass"] = True
                                        
                            Activity["Description"].append(Description)

                        ChronicNeuralActivity.append(Activity)

    return ChronicNeuralActivity

def revertChronicActivityFormat(data):
    Recording = dict()
    Recording["SamplingRate"] = -1 # Variable Frequency
    Recording["Time"] = data["Time"]
    Recording["Data"] = data["Data"].T
    Recording["ChannelNames"] = data["ChannelNamesFix"]
    Recording["StartTime"] = Recording["Time"][0]
    Recording["Duration"] = Recording["Time"][-1] - Recording["Time"][0]
    return Recording