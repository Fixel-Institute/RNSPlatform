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
  Stack,
  Switch,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon
} from "@mui/material"
import { styled } from '@mui/material/styles';

import MDButton from "components/MDButton";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import FormField from "components/MDInput/FormField";
import LoadingProgress from "components/LoadingProgress";
import MuiAlertDialog from "components/MuiAlertDialog";

import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import CachedIcon from '@mui/icons-material/Cached';

// core components
import GenericTimeline from "./GenericTimeline";
import StatisticalTable from "./StatisticalTable";

import DatabaseLayout from "layouts/DatabaseLayout";

import { SessionController } from "database/session-control";
import { usePlatformContext, setContextState } from "context.js";
import { dictionary, dictionaryLookup } from "assets/translation.js";

 function ChronicTimeline() {
  const navigate = useNavigate();
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { participant_uid } = useParams();

  const [data, setData] = useState(false);
  const [annotations, setAnnotations] = useState([]);

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
    if (!participant_uid) {
      navigate("/dashboard", {replace: false});
      return;
    } 
    setContextState(dispatch, "report", "GeneralReports");
    
    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryChronicTimeline", {
      ParticipantId: participant_uid, 
      RequestType: "RequestAll"
    }).then((response) => {
      if (response.data.Timelines.length == 0) {
        SessionController.query("/api/queryChronicTimeline", {
          ParticipantId: participant_uid, 
          RequestType: "DeleteCache"
        });
        setAlert(null);
        return;
      }

      let availableChannels = [];
      for (let i in response.data.Timelines) {
        for (let j in response.data.Timelines[i].ChannelNames) {
          if (!availableChannels.includes(response.data.Timelines[i].ChannelNames[j])) {
            availableChannels.push(response.data.Timelines[i].ChannelNames[j]);
          }
        }
      }

      setAvailableChannels({active: [], options: availableChannels});
      setData(response.data.Timelines);
      setAnnotations(response.data.Annotations);
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });

  }, [participant_uid]);
  
  const updateAnnotationColor = (data) => {
    setAnnotationState({...data})
  };
  
  useEffect(() => {
    for (let i in availableChannels.active) {
      for (let j in data) {
        if (data[j].ChannelNames.includes(availableChannels.active[i])) {
          if (data[j].DataId && !data[j].Data) {
            setAlert(<LoadingProgress/>);
            SessionController.query("/api/queryChronicTimeline", {
              ParticipantId: participant_uid, 
              RequestType: "RequestData",
              DataIds: data[j].DataId,
              Channel: availableChannels.active[i]
            }).then((response) => {
              setData((oldData) => {
                oldData = oldData.filter((d) => d.DataId != data[j].DataId);
                for (let k in response.data) {
                  oldData.push({
                    ...data[j],
                    DataId: null,
                    ...response.data[k],
                  });
                }
                return [...oldData];
              });
              
              setAlert(null);
            }).catch((error) => {
              SessionController.displayError(error, setAlert);
            });

          } 
        }
      }
    }
  }, [availableChannels.active]);

  const handleAddEvent = async (eventInfo) => {
    setAlert(<LoadingProgress />);
    try {
      let duration = 0
      duration = new Date(eventInfo.enddate.toISOString().split("T")[0] + "T" + eventInfo.endtime.toISOString().split("T")[1]).getTime() / 1000;
      duration -= (eventInfo.enddate.utcOffset() - eventInfo.endtime.utcOffset()) * 60;
      duration -= eventInfo.time / 1000;

      const response = await SessionController.query("/api/addParticipantAnnotation", {
        ParticipantId: participant_uid,
        EventName: eventInfo.name,
        EventTime: eventInfo.time / 1000,
        EventDuration: duration,
        EventType: "ChronicCustomEvent"
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
    }

    for (let i = 0; i < annotations.length; i++) {
      let absoluteDiffTime = Math.abs(annotations[i].Date - eventInfo.time/1000);
      if (!eventInfo.targetInfo.timeDiff || absoluteDiffTime < eventInfo.targetInfo.timeDiff) {
        eventInfo.targetInfo = annotations[i];
        eventInfo.targetInfo.timeDiff = absoluteDiffTime;
      }
    }
    
    if (eventInfo.targetInfo.timeDiff) {
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

  const exportCurrentStream = () => {
    let downloader = document.createElement('a');
    downloader.href = SessionController.getDownloadLink("/api/downloadData", {
      ParticipantId: participant_uid,
      CacheType: "queryChronicTimeline"
    });
    downloader.target = '_blank';
    downloader.click();
  };

  return (
    <>
      {alert}
      <DatabaseLayout>
        <MDBox pt={3}>
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
                              {"Generic Chronic Timeline View"}
                            </MDTypography>
                            <MDBox>
                              <MDButton size="large" variant="contained" color="primary" style={{marginBottom: 3}} onClick={() => exportCurrentStream()}>
                                {dictionaryLookup(dictionary.FigureStandardText, "Export", language)}
                              </MDButton>
                              <MDButton size="large" variant="contained" color="info" style={{marginBottom: 3}} onClick={() => {
                                SessionController.query("/api/queryChronicTimeline", {
                                  ParticipantId: participant_uid, 
                                  RequestType: "DeleteCache"
                                }).then((response) => {
                                  window.location.reload()
                                });
                              }}>
                                {"Clear Cache"}
                              </MDButton>
                            </MDBox>
                          </MDBox>
                        </Grid>
                        <Grid item xs={12}>
                          <MDBox p={2}>
                            <Autocomplete
                              multiple
                              value={availableChannels.active}
                              options={availableChannels.options}
                              onChange={(event, value) => setAvailableChannels({...availableChannels, active: value})}
                              renderInput={(params) => (
                                <FormField
                                  {...params}
                                  label={"Channel Selector"}
                                  InputLabelProps={{ shrink: true }}
                                />
                              )}
                            />
                          </MDBox>
                        </Grid>
                        <Grid item xs={12} lg={12}>
                          <GenericTimeline data={data} height={400} availableChannels={availableChannels} annotations={annotations} handleAddEvent={handleAddEvent} handleDeleteEvent={handleDeleteEvent} updateColor={updateAnnotationColor} figureTitle={"ChronicTimeline"}/>
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

              {data ? (
                <Grid item xs={12}>
                  <Card sx={{width: "100%"}}>
                    <Grid container>
                      <Grid item xs={12}>
                        <MDBox p={2} display={"flex"} flexDirection={"row"} justifyContent={"space-between"}>
                          <MDTypography variant={"h6"} fontSize={24}>
                            {"Statistical Table"}
                          </MDTypography>
                        </MDBox>
                      </Grid>
                      <Grid item xs={12} lg={12}>
                        <StatisticalTable data={data} availableChannels={availableChannels} annotations={annotations} />
                      </Grid>
                    </Grid>
                  </Card>
                </Grid>
              ) : null}
            </Grid>
          </MDBox>
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
                key={"ClearCache"}
                icon={<CachedIcon sx={{display: "flex", justifyContent: "center", alignItems: "center", fontSize: 30}}/>}
                tooltipTitle={"Clear Cache (Reprocessing)"}
                onClick={() => {
                  SessionController.query("/api/queryChronicTimeline", {
                    ParticipantId: participant_uid, 
                    RequestType: "DeleteCache"
                  }).then((response) => {
                    window.location.reload()
                  });
                }}
              />
            </SpeedDial>
          </MDBox>
        </MDBox>
      </DatabaseLayout>
    </>
  );
}

export default ChronicTimeline;
