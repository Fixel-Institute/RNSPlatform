from Server import models

import os, sys
from pathlib import Path
import datetime, pytz
import numpy as np
import pandas as pd
from scipy import stats, signal
import pickle
import subprocess
from specparam import SpectralModel

from modules import DataAnalysis, Database, DataCurator
from modules.HelperFunctions import utc_offset_to_timezone

DATABASE_PATH = os.environ.get('DATASERVER_PATH')

AnalysisScriptType = "AperiodicExponent"
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
        source_file.metadata["Version"] = "1.0.0"
        source_file.save()

    userConfig, _ = Database.retrieveProcessingSettings({"ProcessingConfiguration": {
        "TimeSeriesRecording": {
            "StandardFilter": {
                "value": "No Filter"
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

    RecordingCollections = []
    def compute_spectrum(data, fs, method='welch', nperseg=None, scaling='density',avg_type=None):
        if method == 'welch':
            freqs, powers = signal.welch(data, fs=fs, nperseg=nperseg, scaling=scaling,average=avg_type)
        else:
            raise ValueError(f"Unsupported method '{method}'")
        return freqs, powers

    for participant in Participants:
        Data = DataAnalysis.queryAvailableAnalyses(participant["Id"], "TimeSeriesAnalysis")
        Data["Recordings"] = [recording for recording in Data["Recordings"] if recording["Type"] == "Scheduled Streams"]
        Data["Recordings"].sort(key=lambda x: x["Date"])
        
        for i in range(len(Data["Recordings"])):
            Analysis = DataAnalysis.processTimeseriesAnalysis(participant["Id"], Data["Recordings"][i]["Id"], userConfig)
            for recording in Analysis["Signal"]:
                for j in range(len(recording["SignalSeries"]["ChannelNames"])):

                    # Following is adapted from Zoe's Notebook
                    freqs, powers = compute_spectrum(recording["SignalSeries"]["Data"][j], fs=recording["SignalSeries"]["SamplingRate"][0], method='welch',avg_type='mean', nperseg=500, scaling='density')  
                    freq_mask = (freqs >= 1) & (freqs <= 75)
                    
                    min_peak_height = 0.15
                    max_n_peaks = 6
                    min_freq = 1
                    max_freq = 75
                    peak_width_limits=[0.5,12]
                    frequency_range = (min_freq, max_freq)

                    collection = {
                        "ParticipantId": participant["Id"],
                        "Diagnosis": participant["Diagnosis"],
                        "Contact": Data["Recordings"][i]["Metadata"]["ChannelNames"][j],
                        "Date": Data["Recordings"][i]["Date"]
                    }

                    try:
                            fm = SpectralModel(peak_width_limits,aperiodic_mode='knee', min_peak_height=min_peak_height, max_n_peaks=max_n_peaks, verbose=False)
                            fm.fit(freqs[freq_mask], powers[freq_mask]) #added to limit the frequency range
                            collection["AperiodicExponentExist"] = fm.has_model
                            collection["AperiodicExponentModel"] = fm
                            aperiodic_params = fm.get_params('aperiodic')
                            collection["FOOOFParameters"] = {
                                "Offset": aperiodic_params[0],
                                "Knee": aperiodic_params[1],
                                "Exponent": aperiodic_params[2],
                                "Log_Knee": np.log10(np.max(aperiodic_params[1], 1e-6)),
                                "Knee_Frequency": aperiodic_params[1]**(1./aperiodic_params[2]),
                                "R_Squared": fm.get_params('r_squared'),
                                "Error": fm.get_params('error'),
                                "Peaks": fm.get_params('peak_params')[0]
                            } 
                    except:
                        collection["AperiodicExponentExist"] = False
                        print(f"Model fit failed for Channel {recording['SignalSeries']['ChannelNames'][j]}, Participant {participant['Id']}, Recording {Data['Recordings'][i]['Id']}")
                        
                    RecordingCollections.append(collection)

    hashed = Database.saveSourceFile(RecordingCollections, source_file.pointer)
    source_file.metadata["Version"] = AnalysisMethodVersion
    source_file.hashed = hashed
    source_file.save()

  