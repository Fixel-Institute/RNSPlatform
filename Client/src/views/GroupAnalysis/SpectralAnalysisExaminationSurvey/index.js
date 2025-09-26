/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  Autocomplete,
  Card,
  Grid,
  Dialog,
  Stack,
  Switch,
} from "@mui/material"
import { styled } from '@mui/material/styles';

import MDButton from "components/MDButton";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import FormField from "components/MDInput/FormField";
import LoadingProgress from "components/LoadingProgress";
import MuiAlertDialog from "components/MuiAlertDialog";

// core components
import ParticipantListTable from "./ParticipantListTable";
import SpectralFeatureViewer from "./SpectralFeatureViewer";
import DatabaseLayout from "layouts/DatabaseLayout";

import { SessionController } from "database/session-control";
import { usePlatformContext, setContextState } from "context.js";
import { dictionary, dictionaryLookup } from "assets/translation.js";

 function SpectralAnalysisExamination() {
  const navigate = useNavigate();
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { study_uid } = useParams();

  const [data, setData] = useState(false);
  const [resultDialog, setResultDialog] = useState({show: false, participant_uid: "", recordings: []})

  const [availableChannels, setAvailableChannels] = useState({active: null, options: []});

  const [circadianState, setCircadianState] = useState({eventCount: false, amplitude: false});
  const [showAdaptiveMode, setShowAdaptiveMode] = useState(false);
  const [availableTherapy, setAvailableTherapy] = useState({active: null, options: []});
 
  const [annotationState, setAnnotationState] = useState({});
  const [circadianData, setCircadianData] = useState({});
  const [eventPSDData, setEventPSDData] = useState(false);
  const [eventRelatedPower, setEventRelatedPower] = useState(false)
  const [eventLockedPowerData, setEventLockedPowerData] = useState(false);
  const [normalizeCircadianRhythm, setNormalizeCircadianRhythm] = useState(false);

  const [alert, setAlert] = useState(null);

  useEffect(() => {
    setContextState(dispatch, "report", "GroupAnalysis");
    
    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryGroupAnalysis", {
      AnalysisName: "ExtractSpectralFeaturesDuringSurvey", 
      RequestType: "RequestTable"
    }).then((response) => {
      setData(response.data.RecordingCollection.map((a) => {
        a.Participant = response.data.Participants.filter((b) => b.Id == a.ParticipantId);
        if (a.Participant.length > 0) {
          a.Participant = a.Participant[0];
        } else {
          a.Participant = null;
        }
        return a
      }));

      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
    
  }, [study_uid]);
  
  useEffect(() => {
    
  }, [data]);

  const getRecordingData = (participantId) => {

  }

  const exportCurrentStream = () => {
    let downloader = document.createElement('a');
    downloader.href = SessionController.getDownloadLink("/api/downloadData", {
      
      CacheType: "queryChronicTimeline"
    });
    downloader.target = '_blank';
    downloader.click();
  };

  const refreshData = () => {
    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryGroupAnalysis", {
      AnalysisName: "ExtractSpectralFeaturesDuringSurvey", 
      RequestType: "RequestRefresh"
    }).then((response) => {
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  }

  return (
    <>
      {alert}
      <DatabaseLayout>
        <MDBox pt={3}>
          <MDBox display="flex" flexDirection="row" justifyContent="space-between" alignItems="start" style={{marginBottom: 10}}>
            <MDButton size="large" variant="contained" color="info" style={{marginBottom: 3}} onClick={() => refreshData()}>
              {dictionaryLookup(dictionary.FigureStandardText, "Refresh", language)}
            </MDButton>
          </MDBox>
          <MDBox>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Card sx={{width: "100%"}}>
                  <Grid container>
                    {data ? (
                      <>
                        <Grid item xs={12}>
                          <MDBox p={2} display={"flex"} flexDirection={"row"} justifyContent={"space-between"}>
                            <MDTypography variant={"h6"} fontSize={24}>
                              {"Spectral Feature Analysis from Baseline Survey or Streaming Data"}
                            </MDTypography>
                          </MDBox>
                        </Grid>
                        <Grid item xs={12} lg={12}>
                          <ParticipantListTable data={data} getRecordingData={(participant_uid) => {
                            setResultDialog({
                              show: true,
                              participant_uid: participant_uid,
                              recordings: data.filter((a) => a.Participant.Id == participant_uid)
                            });
                          }}/>
                          
                          <Dialog open={resultDialog.show} onClose={() => setResultDialog({...resultDialog, show: false})} 
                            PaperProps={{ sx: {minWidth: { xs: "100vw", sm: 1000 }} }}
                          >
                            <SpectralFeatureViewer figureTitle={"SpectralFeatureViewer"} participant_uid={resultDialog.participant_uid} recordings={resultDialog.recordings} onClose={() => setResultDialog({...resultDialog, show: false})} />
                          </Dialog>
                        </Grid>
                      </>
                    ) : (
                      <Grid item xs={12}>
                        <MDBox p={2}>
                          <MDTypography variant="h6" fontSize={24}>
                            {dictionary.WarningMessage.NoData[language]}
                          </MDTypography>
                        </MDBox>
                      </Grid>
                    )}
                  </Grid>
                </Card>
              </Grid>
            </Grid>
          </MDBox>
        </MDBox>
      </DatabaseLayout>
    </>
  );
}

export default SpectralAnalysisExamination;
