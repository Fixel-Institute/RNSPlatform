""""""
"""
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under Open Source GPL-3.0 License

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
"""
"""
Database Interaction 
===================================================
@author: Jackson Cagle, University of Florida
@email: jackson.cagle@neurology.ufl.edu
"""

import os, sys, pathlib
import pickle, blosc2
import hashlib, hmac
import shutil
from filelock import Timeout, FileLock
import numpy as np

from Server import models
from modules.MedtronicPercept import BrainSenseStream

DATABASE_PATH = os.environ.get('DATASERVER_PATH')
HASH_KEY = os.environ.get('DATASERVER_HASHKEY')

def retrieveProcessingSettings(config=dict()):
    options = {
        "TimeSeriesRecording": {
            "StandardFilter": {
                "name": "Standard Bandpass Filter",
                "description": "",
                "options": ["No Filter","Butterworth 1-100Hz"],
                "value": "Butterworth 1-100Hz"
            },
            "NotchFilter": {
                "name": "Powerline Noise Notch Filter",
                "description": "",
                "options": ["No Filter","Notch 55-65Hz","Notch 45-55Hz"],
                "value": "No Filter"
            },
            "WienerFilter": {
                "name": "Wiener Filter for Artifact Removals",
                "description": "",
                "options": ["No Filter","Use Wiener Filter"],
                "value": "No Filter"
            },
            "CardiacFilter": {
                "name": "Cardiac Filter for EKG Removals",
                "description": "",
                "options": ["No Filter","Use Adaptive Template Matching"],
                "value": "No Filter"
            },
            "SpectrogramMethod": {
                "name": "Time-Frequency Analysis Algorithm",
                "description": "",
                "options": ["Welch's Periodogram","Short-time Fourier Transform","Medtronic Percept PSD","Wavelet","Autoregressive Model (Yule-Walker)"],
                "value": "Welch's Periodogram"
            },
            "BaselineCorrection": {
                "name": "Baseline Correlation for Time-Frequency Analysis",
                "description": "",
                "options": ["No Correction"],
                "value": "No Correction"
            },
            "Normalization": {
                "name": "Normalization for Time-Frequency Analysis",
                "description": "",
                "options": ["No Normalization", "1/f PSD Trend Removal"],
                "value": "No Normalization"
            },
        },
        "PowerSpectralDensity": {
            "PSDMethod": {
                "name": "Power Spectrum Estimation Algorithm",
                "description": "",
                "options": ["Estimated Medtronic PSD","Welch's Periodogram","Autoregressive Model (Yule-Walker)","Short-time Fourier Transform"],
                "value": "Welch's Periodogram"
            },
            "MonopolarEstimation": {
                "name": "Monopolar Estimation Algorithm",
                "description": "",
                "options": ["No Estimation", "DETEC Algorithm (Strelow et. al., 2022)"],
                "value": "No Estimation"
            },
        }
    }

    if not "ProcessingConfiguration" in config.keys():
        return options, True
    
    if not type(config["ProcessingConfiguration"]) == dict:
        return options, True

    for key in config["ProcessingConfiguration"].keys():
        if type(config["ProcessingConfiguration"][key]) == dict:
            for subkey in config["ProcessingConfiguration"][key].keys():
                if type(config["ProcessingConfiguration"][key][subkey]) == dict and subkey in options[key].keys():
                    if not "name" in config["ProcessingConfiguration"][key][subkey].keys():
                        options[key][subkey]["value"] = config["ProcessingConfiguration"][key][subkey]["value"]

                    elif config["ProcessingConfiguration"][key][subkey]["name"] == options[key][subkey]["name"] and config["ProcessingConfiguration"][key][subkey]["description"] == options[key][subkey]["description"] and config["ProcessingConfiguration"][key][subkey]["options"] == options[key][subkey]["options"]:
                        options[key][subkey]["value"] = config["ProcessingConfiguration"][key][subkey]["value"]
    
    return options, not (options==config["ProcessingConfiguration"])

def checkConfiguration(metadata, config):
    if not type(metadata) == dict:
        return False 
    
    for key in config:
        if not key in metadata.keys():
            return False
        if not metadata[key] == config[key]:
            return False
    
    return True

def checkAccessPermission(user, participant_uid, study_uid=None, recording_uid=None):
    Permission = {
        "Deidentified": True,
    }

    Participant = models.Participant.find(uid=participant_uid)
    if not Participant:
        return False 
    
    if Participant.institute.has_permission(user):
        Permission["Deidentified"] = False
        return Permission
    
    if not study_uid:
        return False 
    
    study = models.Study.find(uid=study_uid)
    rel = models.StudyDataRel.find(study=study, participant=Participant)
    if rel:
        if "PHIAllowed" in rel.permission.keys():
            Permission["Deidentified"] = False
            return Permission
        else:
            Permission["Deidentified"] = True
            return Permission
    
    return False

def checkManagePermission(user, participant_uid, type="View"):
    Participant = models.Participant.find(uid=participant_uid)
    if not Participant:
        return False
    return Participant.institute.has_permission(user, type)

def extractParticipantInformation(participant_uid, deidentified=False):
    Participant = models.Participant.find(uid=participant_uid)
    ParticipantInfo = Participant.get_info()
    ParticipantInfo["DBSDevices"] = [i.get_info() for i in models.DBSDevice.find_all(owner=Participant)]
    if deidentified:
        ParticipantInfo["Name"] = ParticipantInfo["Id"]
        ParticipantInfo["MRN"] = ""
        ParticipantInfo["DOB"] = 0

    return ParticipantInfo

def extractParticipantDevices(participant):
    return [i.get_info() for i in models.DBSDevice.find_all(owner=participant)]

# Database.assignSourceFile("","")
def assignSourceFile(old_device_uid, new_device_uid):
    old_device = models.DBSDevice.find(uid=old_device_uid)
    new_device = models.DBSDevice.find(uid=new_device_uid)

    for electrode in old_device.electrodes.all():
        if not new_device.electrodes.filter(uid=electrode.uid).exists():
            new_device.electrodes.add(electrode)

    source_files = models.SourceFile.objects.filter(metadata__Device=old_device.uid).all()
    for file in source_files:
        file.metadata["Device"] = new_device.uid
        file.save()

    old_device.delete()

def mergeParticipants(source, target):
    for entry in models.DBSDevice.find_all(owner=source):
        entry.owner = target
        entry.save()
    
    for entry in models.MERDevice.find_all(owner=source):
        entry.owner = target
        entry.save()
    
    for entry in models.FitbitDevice.find_all(owner=source):
        entry.owner = target
        entry.save()
    
    for entry in models.Electrode.find_all(owner=source):
        entry.owner = target
        entry.save()

    for entry in models.TherapyModification.find_all(owner=source):
        entry.owner = target
        entry.save()

    for entry in models.Annotation.find_all(owner=source):
        entry.owner = target
        entry.save()

    for entry in models.ParticipantLinkRel.find_all(participant=source):
        entry.participant = target
        entry.save()

    for entry in models.ScaleRecord.find_all(participant=source):
        entry.participant = target
        entry.save()

    for entry in models.Participant.find_all(original=source):
        entry.original = target
        entry.save()

    for entry in models.SourceFile.find_all(owner=source):
        entry.owner = target
        entry.save()
    
    source.delete()

def listRecordings(participant_uid):
    Participant = models.Participant.find(uid=participant_uid)
    SourceFiles = models.SourceFile.find_all(owner=Participant)
    DBSDevices = [device.get_info() for device in models.DBSDevice.find_all(owner=Participant)]
    Recordings = models.Recording.find_all(source__in=SourceFiles, type__in=["MedtronicBrainSenseTimeDomain", "MedtronicBrainSensePowerDomain", "MedtronicIndefiniteStream", "DelsysMDAT", "HPFCSV", "AOMPX"])
    
    AllRecordings = []
    for recording in Recordings:
        Description = recording.get_info()
        if recording.type == "MedtronicBrainSenseTimeDomain" or recording.type == "MedtronicIndefiniteStream":
            for device in DBSDevices:
                if device["Id"] == recording.source.metadata["Device"]:
                    Description["Device"] = device
                    for i in range(len(Description["Metadata"]["ChannelNames"])):
                        Description["Metadata"]["ChannelNames"][i] = BrainSenseStream.reformatChannelName(Description["Metadata"]["ChannelNames"][i], Description["Device"]["Electrodes"])

        elif recording.type == "MedtronicBrainSensePowerDomain":
            for device in DBSDevices:
                if device["Id"] == recording.source.metadata["Device"]:
                    Description["Therapy"] = [{
                        "Hemisphere": side,
                        "Frequency": recording.metadata["Therapy"][side]["RateInHertz"],
                        "Pulsewidth": recording.metadata["Therapy"][side]["PulseWidthInMicroSecond"],
                        "Contact": BrainSenseStream.reformatStimulationChannel(recording.metadata["Therapy"][side]["SensingChannel"].replace("SensingChannelDef.",""), device["Electrodes"]),
                        "Segment": ""
                    } for side in ["Left", "Right"] if side in recording.metadata["Therapy"].keys()]
                    Description["Device"] = device
                    for i in range(len(Description["Metadata"]["ChannelNames"])):
                        if Description["Metadata"]["ChannelNames"][i].endswith("Stimulation"):
                            Description["Metadata"]["ChannelNames"][i] = BrainSenseStream.reformatChannelName(Description["Metadata"]["ChannelNames"][i], Description["Device"]["Electrodes"]) + " Stimulation"
                        else:
                            Description["Metadata"]["ChannelNames"][i] = BrainSenseStream.reformatChannelName(Description["Metadata"]["ChannelNames"][i], Description["Device"]["Electrodes"]) + " Recording"

        elif recording.type == "DelsysMDAT":
            pass

        elif recording.type == "HPFCSV":
            Description["Name"] = recording.metadata["SensorType"]

        AllRecordings.append(Description)
        
    return AllRecordings

def listSourceFiles(participant_uid, file_type=None):
    Participant = models.Participant.find(uid=participant_uid)
    if not file_type:
        source_files = models.SourceFile.find_all(owner=Participant)
    else:
        source_files = models.SourceFile.find_all(owner=Participant, type=file_type)

    SourceFiles = []
    DBSDevices = models.DBSDevice.find_all(owner=Participant)
    for source in source_files:
        if source.type == "MedtronicJSON":
            SourceFile = {
                "Id": source.uid,
                "Name": source.name,
                "Type": "Medtronic JSON Sessions",
                "DateOfUpload": source.date,
                "Timezone": source.metadata["Timezone"] if "Timezone" in source.metadata.keys() else ""
            }

            if "Device" in source.metadata.keys():
                for device in DBSDevices:
                    if device.uid == source.metadata["Device"]:
                        SourceFile["Device"] = device.get_info()

            AllRecordings = models.Recording.find_all(source=source)
            SourceFile["RecordingCount"] = len(AllRecordings)
            if SourceFile["RecordingCount"] > 0:
                SourceFile["DateOfRecording"] = np.mean([i.date for i in AllRecordings])
            else:
                SourceFile["DateOfRecording"] = source.date
            SourceFile["TherapyEventCount"] = len(models.TherapyModification.find_all(source=source))
            SourceFile["TherapyEventCount"] = len(models.TherapyModification.find_all(source=source))
            SourceFile["TherapyCount"] = len(models.Therapy.find_all(source=source))
            SourceFile["DBSEventCount"] = len(models.DBSEvent.find_all(source=source).exclude(type="MedtronicDeviceImpedance"))

            SourceFiles.append(SourceFile)
        
        elif source.type == "NeuroImage":
            SourceFile = {
                "Id": source.uid,
                "Name": source.name,
                "Type": "NeuroImaging Data",
                "DateOfUpload": source.date,
                "DateOfRecording": source.date,
                "Timezone": source.metadata["Timezone"] if "Timezone" in source.metadata.keys() else "",
                "DataType": source.metadata["FileType"],
                "Color": source.metadata["Color"] if "Color" in source.metadata.keys() else None,
            }
            try:
                SourceFile["DataSize"] = os.path.getsize(source.pointer)
            except:
                SourceFile["DataSize"] = 0

            SourceFiles.append(SourceFile)

        elif source.type == "HPFCSV":
            SourceFile = {
                "Id": source.uid,
                "Name": source.name,
                "Type": "HDF CSV Format",
                "DateOfUpload": source.date,
                "DateOfRecording": source.date,
                "Timezone": "",
                "DataSize": os.path.getsize(source.pointer)
            }

            AllRecordings = models.Recording.find_all(source=source)
            
            SourceFile["RecordingCount"] = 0
            for i in range(len(AllRecordings)):
                if "ChannelNames" in AllRecordings[i].metadata.keys():
                    SourceFile["RecordingCount"] += len(AllRecordings[i].metadata["ChannelNames"])

            SourceFiles.append(SourceFile)

        elif source.type == "AlphaOmegaMPX":
            SourceFile = {
                "Id": source.uid,
                "Name": source.name,
                "Type": "AlphaOmega MPX Format",
                "DateOfUpload": source.date,
                "DateOfRecording": source.date,
                "Timezone": "",
                "DataSize": os.path.getsize(source.pointer)
            }

            AllRecordings = models.Recording.find_all(source=source)
            
            SourceFile["RecordingCount"] = 0
            for i in range(len(AllRecordings)):
                if "ChannelNames" in AllRecordings[i].metadata.keys():
                    SourceFile["RecordingCount"] += len(AllRecordings[i].metadata["ChannelNames"])

            SourceFiles.append(SourceFile)

        elif source.type == "BRAVORecordingStructure":
            SourceFile = {
                "Id": source.uid,
                "Name": source.name,
                "Type": "BRAVO Recording Structure (Binary)",
                "DateOfUpload": source.date,
                "DateOfRecording": source.date,
                "Timezone": source.metadata["Timezone"] if "Timezone" in source.metadata.keys() else ""
            }

            AllRecordings = models.Recording.find_all(source=source)
            
            SourceFile["SensorType"] = []
            SourceFile["RecordingCount"] = []
            for i in range(len(AllRecordings)):
                if "ChannelNames" in AllRecordings[i].metadata.keys():
                    SourceFile["RecordingCount"].append(len(AllRecordings[i].metadata["ChannelNames"]))
                    SourceFile["SensorType"].append(AllRecordings[i].type)
            SourceFiles.append(SourceFile)

        elif source.type == "UFMDATv2":
            SourceFile = {
                "Id": source.uid,
                "Name": source.name,
                "Type": "Synchronized External Device Data",
                "DateOfUpload": source.date,
                "DateOfRecording": source.date,
                "Timezone": source.metadata["Timezone"] if "Timezone" in source.metadata.keys() else ""
            }

            AllRecordings = models.Recording.find_all(source=source)
            
            SourceFile["SensorType"] = []
            SourceFile["RecordingCount"] = []
            for i in range(len(AllRecordings)):
                if "ChannelNames" in AllRecordings[i].metadata.keys():
                    SourceFile["RecordingCount"].append(len(AllRecordings[i].metadata["ChannelNames"]))
                    SourceFile["SensorType"].append(AllRecordings[i].metadata["SensorType"])
            SourceFiles.append(SourceFile)

        else:
            SourceFile = {
                "Id": source.uid,
                "Name": source.name,
                "Type": source.type,
                "DateOfUpload": source.date,
                "DateOfRecording": source.date,
                "Timezone": source.metadata["Timezone"] if "Timezone" in source.metadata.keys() else ""
            }

            SourceFiles.append(SourceFile)

    SourceFiles.sort(key=lambda x: x["DateOfRecording"])
    return SourceFiles

def deleteSourceFile(pointer):
    if not pointer.startswith(DATABASE_PATH) or ".." in pointer:
        raise Exception("Malicious Attempt at Accessing Other Data in the Computer.")
    
    lock = FileLock(pointer + ".lock")
    try:
        with lock.acquire(timeout=30):
            pathlib.Path.unlink(pathlib.Path(pointer))
        return True
    except Timeout:
        print("Lockfile Not Acquired before Timeout")
        return False

def saveSourceFile(datastruct, pointer, bytes=False):
    pointer = pointer.replace("\\", os.path.sep).replace("/", os.path.sep)
    
    if not pointer.startswith(DATABASE_PATH) or ".." in pointer:
        raise Exception("Malicious Attempt at Accessing Other Data in the Computer.")
    
    if not bytes:
        pData = pickle.dumps(datastruct, protocol=pickle.HIGHEST_PROTOCOL)
    else:
        pData = datastruct

    lock = FileLock(pointer + ".lock")
    try:
        with lock.acquire(timeout=30):
            with open(pointer + ".tmp", "wb+") as file:
                rawBytes = blosc2.compress2(pData, typesize=1)
                hashed = hmac.new(HASH_KEY.encode("utf8"), rawBytes, hashlib.sha256).hexdigest()
                file.write(rawBytes)
            shutil.move(pointer + ".tmp", pointer)
            return hashed
    except Timeout:
        print("Lockfile Not Acquired before Timeout")
        return False

def loadSourceFile(pointer, verifiedHash, bytes=False):
    pointer = pointer.replace("\\", os.path.sep).replace("/", os.path.sep)

    if not pointer.startswith(DATABASE_PATH) or ".." in pointer:
        raise Exception("Malicious Attempt at Accessing Other Data in the Computer.")
    
    with open(pointer, "rb") as file:
        rawBytes = file.read()
    hashed = hmac.new(HASH_KEY.encode("utf8"), rawBytes, hashlib.sha256).hexdigest()
    if not hashed == verifiedHash:
        raise Exception(f"DANGER: Unauthorized Modification of Data {pointer}, risk of Pickle Arbitrary Code Execution.")

    decompressed = blosc2.decompress2(rawBytes)

    # If Request Raw Byte Data
    if bytes:
        return decompressed
    
    # Else just pickle load it
    datastruct = pickle.loads(decompressed)
    return datastruct

def getCachedResult(url, participant_uid, config):
    models.SourceFile.purge(type="CachedResult", date__lt=models.current_time() - 3600)
    metadata = {**config, **{"URL": url, "Participant": participant_uid}}
    result = models.SourceFile.find(type="CachedResult", metadata=metadata)
    if result:
        return loadSourceFile(result.pointer, result.hashed)
    
def saveCachedResult(data, url, participant_uid, config):
    metadata = {**config, **{"URL": url, "Participant": participant_uid}}
    result = models.SourceFile.create(type="CachedResult", metadata=metadata)
    result.pointer = DATABASE_PATH + "visualization" + os.path.sep + participant_uid + os.path.sep + result.uid + ".bdat"
    result.hashed = saveSourceFile(data, DATABASE_PATH + "visualization" + os.path.sep + participant_uid + os.path.sep + result.uid + ".bdat")
    result.save()

def deleteCachedResult(participant_uid=None, url=None):
    if participant_uid and url:
        models.SourceFile.purge(type="CachedResult", metadata__Participant=participant_uid, metadata__URL=url)
    elif participant_uid:
        models.SourceFile.purge(type="CachedResult", metadata__Participant=participant_uid)
    elif url:
        models.SourceFile.purge(type="CachedResult", metadata__URL=url)
    else:
        models.SourceFile.purge(type="CachedResult")
        
