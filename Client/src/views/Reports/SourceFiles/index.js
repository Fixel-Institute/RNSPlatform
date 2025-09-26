/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  Autocomplete,
  Card,
  Collapse,
  Grid,
  Dialog,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import FormField from "components/MDInput/FormField";
import MDButton from "components/MDButton";
import LoadingProgress from "components/LoadingProgress";
import MuiAlertDialog from "components/MuiAlertDialog";

import DatabaseLayout from "layouts/DatabaseLayout";
import MedtronicSourceFileTable from "./MedtronicSourceFileTable";
import NeuroImageFileTable from "./NeuroImageFileTable";
import HPFCSVFileTable from "./HPFCSVFileTable";
import AOMPXFileTable from "./AOMPXFileTable";
import DefaultFileTable from "./DefaultFileTable";
import ExternalDevicesFileTable from "./ExternalDevicesFileTable";

import { SessionController } from "database/session-control";
import { usePlatformContext, setContextState } from "context";
import { dictionary, dictionaryLookup } from "assets/translation";
import BRAVORecordingTable from "./BRAVORecordingTable";

export default function SourceFiles() {
  const navigate = useNavigate();
  const [controller, dispatch] = usePlatformContext();
  const { experiment, TherapeuticEffectLayout, language } = controller;
  const { participant_uid } = useParams();

  const [alert, setAlert] = useState(null);

  const [availableSourceFiles, setAvailableSourceFiles] = useState([]);
  const [viewSourceFiles, setViewSourceFiles] = useState([]);

  const [showSessionLists, setShowSessionLists] = useState(true);

  const [sourceFileType, setSourceFileType] = useState({active: "", options: []});
  const [viewDate, setViewDate] = useState({active: "", options: []});
  
  useEffect(() => {
    if (!participant_uid) {
      navigate("/dashboard", {replace: false});
      return;
    }
    setContextState(dispatch, "report", "DataManager");

    setAlert(<LoadingProgress/>);
    SessionController.query("/api/querySourceFiles", {
      RequestType: "All",
      ParticipantId: participant_uid
    }).then((response) => {
      let options = [];
      for (let i in response.data) {
        if (!options.includes(response.data[i].Type)) {
          options.push(response.data[i].Type);
        }
      }
      if (options.length > 0) setSourceFileType({active: options[0], options: options});
      else setSourceFileType({active: "", options: []});

      setAvailableSourceFiles(response.data);
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  }, []);

  useEffect(() => {
    let options = [];
    for (let i in availableSourceFiles) {
      if (availableSourceFiles[i].Type == sourceFileType.active) {
        const dateString = new Date(availableSourceFiles[i].DateOfRecording*1000).toLocaleString("en-US", {...SessionController.getTimezoneName(availableSourceFiles[i].Timezone),
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZoneName: "longGeneric"
        })

        if (!options.includes(dateString)) {
          options.push(dateString);
        }
      }
    }

    if (options.length > 0) {
      setViewDate((viewDate) => {
        if (!options.includes(viewDate.active)) {
          viewDate.active = options[0];
        }
        viewDate.options = options;
        return {...viewDate} 
      });
    }
    else setViewDate({active: "", options: []});
  }, [availableSourceFiles, sourceFileType.active])

  useEffect(() => {
    let collectiveData = [];
    for (var i = 0; i < availableSourceFiles.length; i++) {
      if (availableSourceFiles[i].Type == sourceFileType.active) {
        const dateString = new Date(availableSourceFiles[i].DateOfRecording*1000).toLocaleString("en-US", {...SessionController.getTimezoneName(availableSourceFiles[i].Timezone),
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZoneName: "longGeneric"
        })

        if (dateString == viewDate.active) {
          collectiveData.push(availableSourceFiles[i]);
        }
      }
    }

    setViewSourceFiles(collectiveData);
  }, [availableSourceFiles, viewDate])

  const handleDeleteSourceFile = (id) => {
    setAlert(<MuiAlertDialog 
      title={"Delete Source File"}
      message={"Are you sure you want to delete the selected source file? This action is not reversible."}
      confirmText={"YES"}
      denyText={"NO"}
      denyButton
      handleClose={() => setAlert(null)}
      handleDeny={() => setAlert(null)}
      handleConfirm={() => {
        setAlert(<LoadingProgress/>);
        SessionController.query("/api/querySourceFiles", {
          RequestType: "Delete",
          ParticipantId: participant_uid,
          SourceId: id
        }).then((response) => {
          setAvailableSourceFiles((sources) => sources.filter((a) => a.Id != id));
          setAlert(null);
        }).catch((error) => {
          SessionController.displayError(error, setAlert);
        });
      }}
    />)
  }

  const handleDownloadSourceFile = (id) => {
    let downloader = document.createElement('a');
    downloader.href = SessionController.getDownloadLink("/api/querySourceFiles", {
      RequestType: "Download",
      ParticipantId: participant_uid,
      SourceId: id
    });
    downloader.target = '_blank';
    downloader.click();
  }

  const deleteSession = (id) => {
  };
  
  return (
    <DatabaseLayout>
      {alert}
      <MDBox mt={2}>
        <Card>
          <MDBox p={2} sx={{display: "flex", flexDirection: {xs: "column", sm: "row"}, justifyContent: "space-between"}}>
            <Autocomplete
              fullWidth
              value={sourceFileType.active}
              options={sourceFileType.options}
              onChange={(event, value) => {
                setViewSourceFiles([]);
                setSourceFileType({...sourceFileType, active: value})
              }}
              renderInput={(params) => (
                <FormField
                  {...params}
                  label={"Filter by Source File Type"}
                  InputLabelProps={{ shrink: true }}
                />
              )}
            />
          </MDBox>
          <MDBox p={2}>
            <Autocomplete
              fullWidth
              value={viewDate.active}
              options={viewDate.options}
              onChange={(event, value) => setViewDate({...viewDate, active: value})}
              renderInput={(params) => (
                <FormField
                  {...params}
                  label={"Select Date of Upload"}
                  InputLabelProps={{ shrink: true }}
                />
              )}
            />
          </MDBox>
          <MDBox p={2}>
            {sourceFileType.active == "Medtronic JSON Sessions" ? (
              <MedtronicSourceFileTable data={viewSourceFiles} downloadData={handleDownloadSourceFile} deleteData={handleDeleteSourceFile} />
            ) : null}
            {sourceFileType.active == "NeuroImaging Data" ? (
              <NeuroImageFileTable data={viewSourceFiles} downloadData={handleDownloadSourceFile} deleteData={handleDeleteSourceFile} />
            ) : null}
            {sourceFileType.active == "AlphaOmega MPX Format" ? (
              <AOMPXFileTable data={viewSourceFiles} downloadData={handleDownloadSourceFile} deleteData={handleDeleteSourceFile} />
            ) : null}
            {sourceFileType.active == "HDF CSV Format" ? (
              <HPFCSVFileTable data={viewSourceFiles} downloadData={handleDownloadSourceFile} deleteData={handleDeleteSourceFile} />
            ) : null}
            {["ChronicNeuralActivitySource","FitbitWebAPISource"].includes(sourceFileType.active) ? (
              <DefaultFileTable data={viewSourceFiles} downloadData={handleDownloadSourceFile} deleteData={handleDeleteSourceFile} />
            ) : null}
            {["MATFile","Synchronized External Device Data"].includes(sourceFileType.active) ? (
              <ExternalDevicesFileTable data={viewSourceFiles} downloadData={handleDownloadSourceFile} deleteData={handleDeleteSourceFile} />
            ) : null}
            {["BRAVORecordingBinaryStructure"].includes(sourceFileType.active) ? (
              <BRAVORecordingTable data={viewSourceFiles} downloadData={handleDownloadSourceFile} deleteData={handleDeleteSourceFile} />
            ) : null}
          </MDBox>
        </Card>
      </MDBox>
    </DatabaseLayout>
  );
};

