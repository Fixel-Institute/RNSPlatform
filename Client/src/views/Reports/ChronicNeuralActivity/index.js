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
  SpeedDialIcon,
} from "@mui/material"
import { styled } from '@mui/material/styles';

import { 
  ChevronRight as ChevronRightIcon,
  Settings as SettingsIcon,
  KeyboardDoubleArrowUp as KeyboardDoubleArrowUpIcon, 
  Dashboard as DashboardIcon,
  Cached as CachedIcon
} from "@mui/icons-material";

import MDButton from "components/MDButton";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import FormField from "components/MDInput/FormField";
import LoadingProgress from "components/LoadingProgress";
import MuiAlertDialog from "components/MuiAlertDialog";

// core components
import ChronicTimeline from "./ChronicTimeline";
import CircadianRhythm from "./CircadianRhythm";
import EventPowerSpectrum from "./EventPowerSpectrum";
import EventRelatedPower from "./EventRelatedPower";

import DatabaseLayout from "layouts/DatabaseLayout";

import { SessionController } from "database/session-control";
import { usePlatformContext, setContextState } from "context.js";
import { dictionary, dictionaryLookup } from "assets/translation.js";

 function ChronicNeuralActivity() {
  const navigate = useNavigate();
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { participant_uid } = useParams();

  const [data, setData] = useState(false);
  const [annotations, setAnnotations] = useState([]);

  const [availableChannels, setAvailableChannels] = useState({active: null, options: []});

  const [circadianState, setCircadianState] = useState({eventCount: false, amplitude: false, histogram: false});
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
    SessionController.query("/api/queryChronicNeuralActivity", {
      ParticipantId: participant_uid, 
      RequestType: "RequestAll"
    }).then((response) => {
      if (response.data.ChronicNeuralActivity.length == 0) {
        setAlert(null);
        return;
      }

      let availableChannels = [];
      let availableTherapy = [];
      if (response.data.AnalysisType === "MedtronicChronicBrainSense") {
        for (let i in response.data.ChronicNeuralActivity) {
          for (let j in response.data.ChronicNeuralActivity[i].ChannelNames) {
            const channelName = response.data.ChronicNeuralActivity[i].Device.Heritage + ": " + response.data.ChronicNeuralActivity[i].ChannelNames[j].replace(" LFP", "").replace(" Amplitude", "");
            if (!availableChannels.includes(channelName)) {
              availableChannels.push(channelName);
            }
            if (response.data.ChronicNeuralActivity[i].Description.Bypassed) {
              continue;
            }
            const therapyName = channelName + " (" + response.data.ChronicNeuralActivity[i].Description[j].Stimulation + " Sense: " + response.data.ChronicNeuralActivity[i].Description[j].SensingFrequency + ")"
            if (!availableTherapy.includes(therapyName)) {
              availableTherapy.push(therapyName);
            }
          }
        }
      }

      setAvailableTherapy({active: availableTherapy.length > 0 ? availableTherapy[0] : "", options: availableTherapy});
      setAvailableChannels({active: availableChannels, options: availableChannels});
      setEventPSDData(() => {
        let options = [];
        for (let i in response.data.Annotations) {
          for (let j in response.data.Annotations[i].EventPSDs) {
            const channelName = response.data.Annotations[i].EventPSDs[j].DeviceHeritage + ": " + response.data.Annotations[i].EventPSDs[j].ChannelName;
            const therapyName = "(" + response.data.Annotations[i].EventPSDs[j].TherapyString + ")"
            response.data.Annotations[i].EventPSDs[j].TherapyLabel = channelName + " " + therapyName;
            if (!options.includes(response.data.Annotations[i].EventPSDs[j].TherapyLabel)) {
              options.push(response.data.Annotations[i].EventPSDs[j].TherapyLabel);
            }
          }
        }
        
        return options.length > 0 ? {data: response.data.Annotations, options: options, active: options[0]} : false;
      });
      setData(response.data);
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
    /*
    if (data) {
      const eventNames = [];
      for (var i = 0; i < data.ChronicData.length; i++) {
        for (var j = 0; j < data.ChronicData[i].EventName.length; j++) {
          for (var name of data.ChronicData[i].EventName[j]) {
            if (!eventNames.includes(name)) {
              eventNames.push(name);
            }
          }
        }
      }
      setEventList(eventNames);

      populateCircadianRhythmSelector(data.ChronicData);
      populateEventLockedPowerSelector(data.ChronicData);
      populateEventPSDSelector(data.EventPSDs)
    }
      */
  }, [data]);

  const handleAddEvent = async (eventInfo) => {
    if (!eventInfo.name) return;

    setAlert(<LoadingProgress />);
    try {
      let duration = 0
      if (eventInfo.hasEndDate) {
        duration = new Date(eventInfo.enddate.toISOString().split("T")[0] + "T" + eventInfo.endtime.toISOString().split("T")[1]).getTime() / 1000;
        duration -= (eventInfo.enddate.utcOffset() - eventInfo.endtime.utcOffset()) * 60;
        duration -= eventInfo.time / 1000;
      }

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
      CacheType: "queryChronicNeuralActivity"
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
                              {dictionary.ChronicBrainSense.Figure.FigureTitle[language]}
                            </MDTypography>
                            <MDBox>
                              <MDButton size="large" variant="contained" color="primary" style={{marginBottom: 3}} onClick={() => exportCurrentStream()}>
                                {dictionaryLookup(dictionary.FigureStandardText, "Export", language)}
                              </MDButton>
                              <MDButton size="large" variant="contained" color="info" style={{marginBottom: 3}} onClick={() => {
                                SessionController.query("/api/queryChronicNeuralActivity", {
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
                          <MDBox px={2} lineHeight={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Switch value={showAdaptiveMode} onClick={() => setShowAdaptiveMode(!showAdaptiveMode)} />
                            <MDTypography variant={"subtitle"} fontSize={15}>
                              {"Show Adaptive Duty Cycle on Timeline"}
                            </MDTypography>
                          </Stack>
                          </MDBox>
                          <ChronicTimeline data={data} showAdaptiveMode={showAdaptiveMode} height={400} availableChannels={availableChannels} annotations={annotations} handleAddEvent={handleAddEvent} handleDeleteEvent={handleDeleteEvent} updateColor={updateAnnotationColor} figureTitle={"ChronicTimeline"}/>
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
                        
                      </Grid>
                    </Grid>
                  </Card>
                </Grid>
              ) : null}
              {data ? (
                <Grid item xs={12} lg={6}>
                  <Card sx={{width: "100%"}}>
                    <Grid container>
                      <Grid item xs={12}>
                        <MDBox p={2} lineHeight={1}>
                          <Autocomplete
                            value={availableTherapy.active}
                            options={["Time-based Assessment", ...availableTherapy.options]}
                            onChange={(event, value) => {
                              setAvailableTherapy({...availableTherapy, active: value})
                            }}
                            renderInput={(params) => (
                              <FormField
                                {...params}
                                label={dictionary.ChronicBrainSense.Select.Therapy[language]}
                                InputLabelProps={{ shrink: true }}
                              />
                            )}
                            disableClearable
                          />
                        </MDBox>
                      </Grid>
                      <Grid item xs={12}>
                        <MDBox px={2} lineHeight={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Switch value={circadianState.eventCount} onClick={() => setCircadianState({...circadianState, eventCount: !circadianState.eventCount})} />
                          <MDTypography variant={"subtitle"} fontSize={15}>
                            {"Show Event Histogram on Circadian Rhythm"}
                          </MDTypography>
                        </Stack>
                        </MDBox>
                        <MDBox px={2} lineHeight={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Switch value={circadianState.histogram} onClick={() => setCircadianState({...circadianState, histogram: !circadianState.histogram})} />
                          <MDTypography variant={"subtitle"} fontSize={15}>
                            {"Show Power Distribution"}
                          </MDTypography>
                        </Stack>
                        </MDBox>
                      </Grid>
                      <Grid item xs={12}>
                        <CircadianRhythm data={data} channelSelector={availableChannels.options} activeChannel={availableTherapy.active} annotations={annotations} circadianState={circadianState} figureTitle={"CircadianRhythm"}/>
                      </Grid>
                    </Grid>
                  </Card>
                </Grid>
              ) : null}
              {data ? (
                <Grid item xs={12} lg={6}>
                  <Card sx={{width: "100%"}}>
                    <Grid container>
                      <Grid item xs={12}>
                        <MDBox p={2} lineHeight={1}>
                          <Autocomplete
                            value={availableTherapy.active}
                            options={availableTherapy.options}
                            onChange={(event, value) => {
                              setAvailableTherapy({...availableTherapy, active: value})
                            }}
                            renderInput={(params) => (
                              <FormField
                                {...params}
                                label={dictionary.ChronicBrainSense.Select.Therapy[language]}
                                InputLabelProps={{ shrink: true }}
                              />
                            )}
                            disableClearable
                          />
                        </MDBox>
                      </Grid>
                      <Grid item xs={12}>
                        <EventRelatedPower data={data} activeChannel={availableTherapy.active} annotations={annotations} annotationState={annotationState} figureTitle={"EventRelatedPower"}/>
                      </Grid>
                    </Grid>
                  </Card>
                </Grid>
              ) : null}
              {eventPSDData ? (
                <Grid item xs={12} lg={6}>
                  <Card sx={{width: "100%"}}>
                    <Grid container>
                      <Grid item xs={12}>
                        <MDBox p={2} lineHeight={1}>
                          <Autocomplete
                            value={eventPSDData.active}
                            options={eventPSDData.options}
                            onChange={(event, value) => {
                              setEventPSDData({...eventPSDData, active: value})
                            }}
                            renderInput={(params) => (
                              <FormField
                                {...params}
                                label={dictionary.ChronicBrainSense.Select.Therapy[language]}
                                InputLabelProps={{ shrink: true }}
                              />
                            )}
                            disableClearable
                          />
                        </MDBox>
                      </Grid>
                      <Grid item xs={12}>
                        <EventPowerSpectrum dataToRender={eventPSDData.data} activeChannel={eventPSDData.active} figureTitle={"EventPowerSpectrums"}/>
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
                  SessionController.query("/api/queryChronicNeuralActivity", {
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

export default ChronicNeuralActivity;
