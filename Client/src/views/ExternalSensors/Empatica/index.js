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
  Drawer,
  Dialog,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Card,
  Grid,
  IconButton,
  TextField,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Slider
} from "@mui/material"

import { 
  ChevronRight as ChevronRightIcon,
  Settings as SettingsIcon,
  KeyboardDoubleArrowUp as KeyboardDoubleArrowUpIcon, 
  Dashboard as DashboardIcon,
  Cached as CachedIcon
} from "@mui/icons-material";

// core components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import LoadingProgress from "components/LoadingProgress";
import MuiAlertDialog from "components/MuiAlertDialog";
import FormField from "components/MDInput/FormField";
import GenericTimeline from "./GenericTimeline";

import DatabaseLayout from "layouts/DatabaseLayout";
import ConfigurationDialog from "components/ConfigurationDialog";

import { SessionController } from "database/session-control";
import { usePlatformContext, setContextState } from "context.js";
import { dictionary, dictionaryLookup } from "assets/translation.js";

function EmpaticaDataExplorer() {
  const navigate = useNavigate();
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { participant_uid } = useParams();

  const [recordingId, setRecordingId] = useState([]);
  const [availableChannels, setAvailableChannels] = useState({active: [], options: []});

  const [availableAnalysis, setAvailableAnalysis] = useState([]);
  const [data, setData] = useState(false);
  const [dataToRender, setDataToRender] = useState(false);

  const [annotations, setAnnotations] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState({open: false, config: {}});
  const [channel, setChannel] = useState({active: [], options: []});

  const [timeseriesPlayback, setTimeseriesPlayback] = useState({data: [], playing: false});
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!participant_uid) {
      navigate("/dashboard", {replace: false});
      return;
    }
    setContextState(dispatch, "report", "ExternalSensorReports");

    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryEmpaticaData", {
      RequestType: "RequestOverview",
      ParticipantId: participant_uid
    }).then((response) => {
      for (let i in response.data) {
        for (let j in response.data[i].ChannelNames) {
          if (!availableChannels.options.includes(response.data[i].ChannelNames[j])) {
            availableChannels.options.push(response.data[i].ChannelNames[j]);
          }
        }
      }
      setAvailableChannels({...availableChannels, active: []});
      setAvailableAnalysis(response.data);
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
    
  }, [participant_uid]);

  useEffect(() => {
    const queryData = async () => {
      if (availableChannels.active.length > 0) {
        let newData = data ? {...data} : {};
        setAlert(<LoadingProgress/>);
        for (let i = 0; i < availableChannels.active.length; i++) {
          if (!newData[availableChannels.active[i]]) {
            try {
              const response = await SessionController.query("/api/queryEmpaticaData", {
                RequestType: "RequestData",
                ParticipantId: participant_uid,
                ChannelName: availableChannels.active[i]
              });
              newData[availableChannels.active[i]] = response.data;
            } catch (error) {
              SessionController.displayError(error, setAlert);
            }
          }
        }
        setData(newData);
        setAlert(null);
      }
    }

    queryData();
  }, [availableChannels.active]);

  const handleAddEvent = async (eventInfo) => {
    setAlert(<LoadingProgress />);
    try {
      const response = await SessionController.query("/api/addParticipantAnnotation", {
        ParticipantId: participant_uid,
        EventName: eventInfo.name,
        EventTime: eventInfo.time / 1000,
        EventDuration: parseFloat(eventInfo.duration),
        EventType: "RecordingCustomEvent"
      });
      setAlert(null);

      if (response.status == 200) {
        setAnnotations([...annotations, response.data]);
      }
    } catch (error) {
      SessionController.displayError(error, setAlert);
    }
  };

  const handleDeleteEvent = async (eventInfo) => {
    if (annotations.length > 0) {
      eventInfo.targetInfo = eventInfo;
      eventInfo.targetInfo.timeDiff = 10;
    }

    for (let i = 0; i < annotations.length; i++) {
      let absoluteDiffTime = Math.abs(annotations[i].Date - eventInfo.time/1000);
      if (absoluteDiffTime < eventInfo.targetInfo.timeDiff) {
        eventInfo.targetInfo = annotations[i];
        eventInfo.targetInfo.timeDiff = absoluteDiffTime;
      }
    }
    
    if (eventInfo.targetInfo.timeDiff < 10) {
      setAlert(<MuiAlertDialog 
        title={`Remove ${eventInfo.targetInfo.Name} Event`}
        message={`Are you sure you want to delete the entry [${eventInfo.targetInfo.Name}] @ ${new Date(eventInfo.targetInfo.Date*1000)} ?`}
        confirmText={"YES"}
        denyText={"NO"}
        denyButton
        handleClose={() => setAlert(null)}
        handleDeny={() => setAlert(null)}
        handleConfirm={() => {
          SessionController.query("/api/deleteParticipantAnnotation", {
            ParticipantId: participant_uid,
            EventId: eventInfo.targetInfo.Id
          }).then(() => {
            setAnnotations((annotations) => {
              return [...annotations.filter((a) => a.Id != eventInfo.targetInfo.Id)];
            });
            setAlert(null);
          }).catch((error) => {
            SessionController.displayError(error, setAlert);
          });
        }}
      />)
    }
  }

  const handleAdjustAlignment = async (alignment, eventInfo) => {
    setAlert(<LoadingProgress />)
    const Alignment = parseFloat(alignment.alignment)/1000;
    try {
      const response = await SessionController.query("/api/setRecordingTimeShift", {
        ParticipantId: participant_uid,
        RequestType: "Recording",
        RecordingId: eventInfo.channel,
        Alignment: Alignment
      })
      setAlert(null);
      
      if (response.status == 200) {
        setData((data) => {
          for (let i in data.Signal) {
            if (data.Signal[i].RecordingId == eventInfo.channel) {
              data.Signal[i].Alignment = Alignment
            }
          }
          for (let i in data.Therapy) {
            if (data.Therapy[i].RecordingId == eventInfo.channel) {
              data.Therapy[i].Alignment = Alignment
            }
          }
          return {...data};
        });
      }
      return response
    } catch (error) {
      SessionController.displayError(error, setAlert);
    }
  }
  

  return (
    <DatabaseLayout>
      {alert}
      <MDBox pt={3}>
        <MDBox>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Card sx={{width: "100%"}}>
                <Grid container>
                  <Grid item xs={12}>
                    <MDBox p={2} lineHeight={1}>
                      {availableAnalysis.length > 0 ? (
                        <Autocomplete 
                          multiple 
                          renderInput={(params) => (
                            <TextField {...params} variant="standard"/>
                          )}
                          isOptionEqualToValue={(option, value) => {
                            return option === value;
                          }}
                          renderOption={(props, option) => <li {...props}>{option}</li>}
                          value={availableChannels.active}
                          options={availableChannels.options}
                          onChange={(event, newValue) => setAvailableChannels({...availableChannels, active: newValue})}
                        />
                      ) : (
                        <MDTypography variant="h6" fontSize={24}>
                          {dictionary.WarningMessage.NoData[language]}
                        </MDTypography>
                      )}
                    </MDBox>
                  </Grid>
                </Grid>
              </Card>
            </Grid>
            {data ? (
              <Grid item xs={12}>
                <Card sx={{width: "100%"}}>
                  <Grid container>
                    <Grid item xs={12}>
                      <MDBox display={"flex"} justifyContent={"space-between"} p={3}>
                        <MDBox display={"flex"} flexDirection={"column"}>
                          <MDTypography variant="h5" fontWeight={"bold"} fontSize={24}>
                            {"Time-Series Analysis"}
                          </MDTypography>
                        </MDBox>
                      </MDBox>
                    </Grid>
                    <Grid item xs={12}>
                      <GenericTimeline data={data} height={300} availableChannels={availableChannels} 
                                      annotations={annotations} handleAddEvent={handleAddEvent} handleDeleteEvent={handleDeleteEvent}
                                      figureTitle={"ChronicTimeline"}/>
                    </Grid>
                  </Grid>
                </Card>
              </Grid>
            ) : null}
            
          </Grid>
          
          <ConfigurationDialog show={drawerOpen.open} setShow={(state) => setDrawerOpen({open: false})} setAlert={setAlert} />
          <MDBox style={{
            position: 'sticky',
            bottom: 32,
            right: 32,
            pointerEvents: "none"
          }}>
            <SpeedDial
              ariaLabel={"SurveySpeedDial"}
              color={"info"}
              icon={<SpeedDialIcon sx={{display: "flex", justifyContent: "center", alignItems: "center", fontSize: 30}}/>}
              FabProps={{
                color: "info",
                sx: {display: "flex", marginLeft: "auto"}
              }}
              sx={{alignItems: "end"}}
              hidden={false}
            >
              <SpeedDialAction
                key={"GoToTop"}
                icon={<KeyboardDoubleArrowUpIcon sx={{display: "flex", justifyContent: "center", alignItems: "center", fontSize: 30}}/>}
                tooltipTitle={"Go to Top"}
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
              <SpeedDialAction
                key={"ChangeSettings"}
                icon={<SettingsIcon sx={{display: "flex", justifyContent: "center", alignItems: "center", fontSize: 30}}/>}
                tooltipTitle={"Edit Processing Configurations"}
                onClick={() => setDrawerOpen({...drawerOpen, open: true})}
              />
              <SpeedDialAction
                key={"ClearCache"}
                icon={<CachedIcon sx={{display: "flex", justifyContent: "center", alignItems: "center", fontSize: 30}}/>}
                tooltipTitle={"Clear Cache (Reprocessing)"}
                onClick={() => {
                  
                }}
              />
            </SpeedDial>
          </MDBox>
        </MDBox>
      </MDBox>
    </DatabaseLayout>
  );
}

export default EmpaticaDataExplorer;
