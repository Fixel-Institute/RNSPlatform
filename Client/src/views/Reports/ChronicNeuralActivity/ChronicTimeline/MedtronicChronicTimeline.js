/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useCallback, useEffect, useState, useMemo } from "react";
import { useResizeDetector } from 'react-resize-detector';
import * as Math from "mathjs";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

import moment from "moment";
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from "@mui/x-date-pickers";

import colormap from "colormap";
import { TwitterPicker, BlockPicker } from "react-color";

import { Card, Menu, MenuItem, Dialog, DialogContent, Grid, IconButton, Popover, TextField, DialogActions, Switch } from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";

import { dictionary, dictionaryLookup } from "assets/translation";
import { PlotlyRenderManager } from "graphing-utility/Plotly";
import { usePlatformContext } from "context";

const filter = createFilterOptions();

export default function MedtronicChronicTimeline({data, availableChannels, showAdaptiveMode, annotations, handleAddEvent, handleDeleteEvent, updateColor, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;

  const [contextMenu, setContextMenu] = useState(null);
  const [eventInfo, setEventInfo] = useState({ name: "", time: 0, enddate: null, endtime: null, hasEndDate: true, show: false });
  const [popup, setPopupState] = useState({item: ""});

  const [fig, setFig] = useState(null);
  const [renderData, setRenderData] = useState(null);
  const [annotationState, setAnnotationState] = useState({});

  useEffect(() => {
    const fig = new PlotlyRenderManager(figureTitle, language);
    setFig(fig);
  }, [figureTitle]);

  useEffect(() => {
    if (!fig) return;
    
    if (!fig.fresh) {
      fig.clearData();
    }

    const ax = fig.subplots(availableChannels.active.length*2, 1, {sharex: true, sharey: true});
    let subplotIds = [];
    for (let i in availableChannels.active) {
      subplotIds.push(`${availableChannels.active[i]}`);
      subplotIds.push(`${availableChannels.active[i]} Stimulation`);
      fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)}`, {fontSize: 15}, ax[i*2]);
      fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Amplitude", language)}`, {fontSize: 15}, ax[i*2+1]);
      fig.setYlim(showAdaptiveMode ? [0, 100] : [0, 5], ax[i*2+1]);
      fig.setSubtitle(`${availableChannels.active[i]}`,ax[i*2]);
      fig.setSubtitle(`${availableChannels.active[i]} Stimulation`,ax[i*2+1]);
    }
    fig.setSubplotId(subplotIds);
    
    fig.setLegend({ tracegroupgap: 5, xanchor: "left", y: 0.5, });
    fig.setLayoutProps({ hovermode: "x", hoverdistance: 1 });

    if (!fig.fresh) {
      for (let i in renderData) {
        const subAx = fig.getAxes(renderData[i].axName);
        if (subAx) {
          fig.plot(renderData[i].x, renderData[i].y, renderData[i].options, subAx);
        }
      }
      fig.render();
    }

  }, [fig, availableChannels]);

  const getMax = (list) => {
    let max = -Infinity;
    for (let i in list) {
      if (list[i] && list[i] > max) max = list[i];
    }

    if (max === -Infinity) return 0;
    return max;
  }

  const getAdaptiveParameters = (therapyNote, channelName) => {
    if (!therapyNote) return { "Mode": "Unknown" };

    let Parameters = {"Mode": "Adaptive"};
    for (let i in therapyNote.StimulationSettings) {
      if (therapyNote.StimulationSettings[i].Electrode && channelName.startsWith(therapyNote.StimulationSettings[i].Electrode.CustomName)) {
        const Recordings = therapyNote.AdaptiveSettings[i].RecordingConfiguration.Config;
        if (Recordings.Thresholds) {
          if (typeof Recordings.Thresholds.LFPThresholds[0] === "object") {
            Recordings.Thresholds.LFPThresholds = Recordings.Thresholds.LFPThresholds[0].Value;
          }
          if (Recordings.Thresholds.LFPThresholds[0] !== 20 && Recordings.Thresholds.LFPThresholds[1] !== 30) {
            Parameters["LFPThresholds"] = Recordings.Thresholds.LFPThresholds;
            if (Parameters["LFPThresholds"][0] == Parameters["LFPThresholds"][1]) {
              Parameters["LFPThresholds"] = [Parameters["LFPThresholds"][0]];
            }
          }
        }
        if (therapyNote.AdaptiveSettings[i].StimulationConfiguration.Type == "Medtronic Adaptive") {
          Parameters["StimulationLimits"] = Recordings.Thresholds.AmplitudeThreshold;
        }
      }
    }
    return Parameters;
  }

  useEffect(() => {
    if (!fig) return;

    let lineSeries = [];
    for (let i in data) {
      let timeArray = data[i]["Time"].map((a) => new Date(a*1000));
      for (let j in data[i].ChannelNames) {
        const channelName = data[i].Device.Heritage + ": " + (data[i].ChannelNames[j].endsWith("Amplitude") ? data[i].ChannelNames[j].replace(" Amplitude", " Stimulation") : data[i].ChannelNames[j].replace(" LFP", ""));
        if (!data[i].Description[j].Bypass || channelName.endsWith("Stimulation")) {
          const AdaptiveParameters = getAdaptiveParameters(data[i].TherapyNote, data[i]["ChannelNames"][j]);
          if (channelName.endsWith("Stimulation")) {
            if (AdaptiveParameters.StimulationLimits && showAdaptiveMode) {
              if (AdaptiveParameters.StimulationLimits[1] !== 0) {
                lineSeries.push({
                  type: "lineseries",
                  x: timeArray, y: data[i]["Data"][j].map((a) => 100 * (a - AdaptiveParameters.StimulationLimits[0]) / (AdaptiveParameters.StimulationLimits[1] - AdaptiveParameters.StimulationLimits[0]) ),
                  options: {
                    id: channelName,
                    linewidth: 1,
                    color: "#FF0000",
                    hovertemplate: "  %{x} <br>  " + data[i].Description[j].Stimulation + (channelName.endsWith("Stimulation") ? "" : ("<br>  Recording: " + data[i].RecordingString)) + "<br>  %{y:.2f}% [" + AdaptiveParameters.StimulationLimits[0].toFixed(1) + " - " + AdaptiveParameters.StimulationLimits[1].toFixed(1) + "] <extra></extra>"
                  }, 
                  axName: channelName
                });
                continue
              }
            }
            lineSeries.push({
              type: "lineseries",
              x: timeArray, y: showAdaptiveMode ? data[i]["Data"][j].map((a) => a > 0 ? 100: 0) : data[i]["Data"][j],
              options: {
                id: channelName,
                linewidth: 1,
                color: "#FF0000",
                hovertemplate: showAdaptiveMode ? ("  %{x} <br>  " + data[i].Description[j].Stimulation + (channelName.endsWith("Stimulation") ? "" : ("<br>  Recording: " + data[i].RecordingString)) + "<br>  %{y:.2f}% <extra></extra>") :
                ("  %{x} <br>  " + data[i].Description[j].Stimulation + (channelName.endsWith("Stimulation") ? "" : ("<br>  Recording: " + data[i].RecordingString)) + "<br>  %{y:.2f} " + data[i].ChannelUnits[j] + " <extra></extra>")
              }, 
              axName: channelName
            });
          } else {

            lineSeries.push({
              type: "lineseries",
              x: timeArray, y: data[i]["Data"][j],
              ylim: [0,getMax(data[i]["Data"][j])],
              options: {
                id: channelName,
                linewidth: 1,
                color: channelName.endsWith("Stimulation") ? "#FF0000" : "#000000" ,
                hovertemplate: "  %{x} <br>  " + data[i].Description[j].Stimulation + (channelName.endsWith("Stimulation") ? "" : ("<br>  Recording: " + data[i].Description[j].SensingFrequency)) + "<br>  %{y:.2f}" + data[i].ChannelUnits[j] + " <extra></extra>"
              }, 
              axName: channelName
            });

            if (AdaptiveParameters.LFPThresholds) {
              for (let k in AdaptiveParameters.LFPThresholds) {
                lineSeries.push({
                  type: "lineseries",
                  x: [timeArray[0], timeArray[timeArray.length-1]], y: [AdaptiveParameters.LFPThresholds[k], AdaptiveParameters.LFPThresholds[k]],
                  options: {
                    linewidth: 2,
                    color: "#FFAA00",
                    hovertemplate: "<extra></extra>",
                    showlegend: false,
                  }, 
                  axName: channelName
                });
              }
            }
          }
        }
      }
    }

    for (let i in annotations) {
      for (let j in availableChannels.active) {
        if (!annotations[i].Duration) {
          lineSeries.push({
            type: "annotations",
            x: [new Date(annotations[i].Date*1000), new Date(annotations[i].Date*1000)], y: [0, 50000],
            options: {
              id: annotations[i].Id,
              name: annotations[i].Name,
              linewidth: 2,
              color: annotationState[annotations[i].Name] ? annotationState[annotations[i].Name].color : "#00FF00",
              hovertemplate: "  %{x} <br>  " + annotations[i].Name + " <extra></extra>"
            }, 
            axName: availableChannels.active[j]
          });
        } else {
          lineSeries.push({
            type: "shading",
            x: [new Date(annotations[i].Date*1000), new Date(annotations[i].Date*1000 + annotations[i].Duration*1000)], y: [0, 50000],
            xDot: [new Date(annotations[i].Date*1000)],
            y: [0,50000],
            yDot: [0],
            options: {
              id: annotations[i].Id,
              name: annotations[i].Name,
              size: 10,
              color: annotationState[annotations[i].Name] ? annotationState[annotations[i].Name].color : "#00FF00",
              alpha: 0.3, 
              hovertemplate: "  %{x} <br>  " + annotations[i].Name + " <extra></extra>"
            }, 
            axName: availableChannels.active[j]
          })
        }
      }
    }

    setRenderData(lineSeries);
  }, [fig, data, showAdaptiveMode, annotations]);

  useEffect(() => {
    setAnnotationState((annotationState) => {
      const colors = colormap({
        colormap: 'hsv',
        nshades: 12,
        format: 'hex',
        alpha: 1,
      });

      for (let i in annotations) {
        if (!annotationState[annotations[i].Name]) {
          annotationState[annotations[i].Name] = {show: true, color: colors[10-Object.keys(annotationState).length > 0 ? 10-Object.keys(annotationState).length : 0]}
        }
      }
      return {...annotationState}
    })
  }, [annotations]);

  useEffect(() => {
    if (!fig) return;

    setRenderData((renderData) => {
      for (let i in renderData) {
        if (renderData[i].type === "annotations" || renderData[i].type === "shading") {
          renderData[i].options.color = annotationState[renderData[i].options.name] ? annotationState[renderData[i].options.name].color : "#00FF00";
          renderData[i].options.hidden = annotationState[renderData[i].options.name] ? !annotationState[renderData[i].options.name].show : false;
        }
      }
      return [...renderData];
    })
  }, [fig, annotationState]);

  useEffect(() => {
    updateColor(annotationState);
  }, [annotationState]);

  useEffect(() => {
    if (!fig || !renderData) return;

    fig.traces = [];
    let yLim = {};
    for (let i in renderData) {
      const ax = fig.getAxes(renderData[i].axName);
      if (renderData[i].type == "lineseries") {
        if (!yLim[renderData[i].axName]) yLim[renderData[i].axName] = [0,1];
        if (getMax(renderData[i].y) > yLim[renderData[i].axName][1]) {
          yLim[renderData[i].axName][1] = getMax(renderData[i].y)*1.1;
          fig.setYlim(yLim[renderData[i].axName], ax);
        };
      } else if (renderData[i].type === "shading") {
        fig.addShadedArea(renderData[i].x, renderData[i].y, {...renderData[i].options, hovertemplate: "<extra></extra>"}, ax);
        fig.scatter(renderData[i].xDot, renderData[i].yDot, renderData[i].options, ax);
        continue;
      }

      if (!renderData[i].options.hidden) fig.plot(renderData[i].x, renderData[i].y, renderData[i].options, ax);
    }
    fig.render();

    const ref = document.getElementById(figureTitle);
    if (ref) {
      ref.addEventListener("contextmenu", fig.onClick);
      document.addEventListener("PlotlyClick", plotly_onClick);
      document.addEventListener("PlotlyRelayout", plotly_onZoom);
      return () => {
        ref.removeEventListener("contextmenu", fig.onClick);
        document.removeEventListener("PlotlyClick", plotly_onClick);
        document.addEventListener("PlotlyRelayout", plotly_onZoom);
      }
    };
  }, [fig, renderData]);

  const plotly_onClick = (evt) => {
    setEventInfo((eventInfo) => {
      eventInfo.channel_name = evt.detail.ax.id;
      eventInfo.time = new Date(evt.detail.x).getTime();
      return eventInfo;
    });
  }

  const plotly_onZoom = (evt) => {
    
  }

  const onResize = useCallback(() => {
    if (!fig) return;

    fig.refresh();
  }, [fig]);

  const {ref} = useResizeDetector({
    onResize: onResize,
    refreshMode: "debounce",
    refreshRate: 50,
    skipOnMount: false
  });

  const onContextMenu = (event) => {
    event.preventDefault();
    setContextMenu( contextMenu === null ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, } : null );
  }

  return (
    <Grid container spacing={2} sx={{marginTop: 1}}>
      <Grid item xs={12} sx={{marginLeft: 5, marginRight: 5}}>
        <Grid container spacing={2}>
          {Object.keys(annotationState).map((name) => {
            if (!name) return null
            return <Grid item key={name} xs={6} sm={4} md={3} lg={2}>
              <Card sx={{background: annotationState[name].show ? "" : "darkgrey"}}>
              <MDBox display={"flex"} flexDirection={"row"} alignItems={"center"} px={2} py={1}>
                <IconButton
                  style={{padding: 0, marginRight: 3, borderStyle: "solid", borderColor: "#000000", borderWidth: 1, height: "100%"}} 
                  onClick={(event) => setPopupState({item: name, anchorEl: event.currentTarget})}
                >
                  <img style={{background: annotationState[name].color, padding: 8, borderRadius: "50%"}}/>
                </IconButton>
                <Popover 
                  open={popup.item == name}
                  onClose={() => setPopupState({item: "", anchorEl: null})}
                  anchorEl={popup.anchorEl}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'left',
                  }}
                  transformOrigin={{
                    vertical: "top",
                    horizontal: 'left',
                  }}
                  PaperProps={{sx: {boxShadow: "none"}}}
                >
                  <TwitterPicker color={annotationState[name].color} onChange={(color) => {
                    setAnnotationState((annotationState) => {
                      annotationState[name].color = color.hex;
                      return {...annotationState}
                    });
                  }}/>
                </Popover>
                <MDTypography variant="h6" fontSize={15} color={"dark"} style={{cursor: "pointer"}} onClick={() => {
                  setAnnotationState((annotationState) => {
                    annotationState[name].show = !annotationState[name].show;
                    return {...annotationState}
                  });
                }}>
                  {name}
                </MDTypography>
              </MDBox>
              </Card>
            </Grid>
          })}
        </Grid>
      </Grid>
      <Grid item xs={12}>
        <MDBox ref={ref} onContextMenu={onContextMenu} id={figureTitle} style={{marginBottom: 10, height: 400*availableChannels.active.length+100, width: "100%", display: availableChannels.active.length == 0 ? "none" : ""}}>
          <Menu
            open={contextMenu !== null}
            onClose={() => setContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={ contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined }
            disableScrollLock={true}
          >
            <MenuItem onClick={() => {
              setContextMenu(null);
              setEventInfo({...eventInfo, name: "", hasEndDate: false, 
                enddate: moment(new Date(eventInfo.time)), 
                endtime: moment(new Date(eventInfo.time)),
                show: true});
            }}>{"Add New Event"}</MenuItem>
            <MenuItem onClick={() => {
              setContextMenu(null);
              handleDeleteEvent(eventInfo);
            }}>{"Delete Event"}</MenuItem>
          </Menu>

          <Dialog open={eventInfo.show} onClose={() => setEventInfo({...eventInfo, show: false})}>
            <MDBox px={2} pt={2} sx={{minWidth: 500}}>
              <MDTypography variant="h5">
                {"New Chronic Event Marking"} 
              </MDTypography>
              <MDTypography variant="h6">
                {"Time: "}{new Date(eventInfo.time).toLocaleString("en-US", {
                  year: "numeric", 
                  month: "long",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "longGeneric"
                })} 
              </MDTypography>
            </MDBox>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={12} style={{display: "flex", flexDirection: "column"}}>
                  <TextField
                    variant="standard"
                    margin="dense"
                    id={"event-annotation"}
                    type={"text"}
                    label="Annotation Name"
                    placeholder={"Annotation Name"}
                    value={eventInfo.name}
                    onChange={(event) => setEventInfo({...eventInfo, name: event.target.value})}
                  />
                </Grid>
                <Grid item xs={12} style={{display: "flex", flexDirection: "column"}}>
                  <MDBox display={"flex"} flexDirection={"row"} alignItems={"center"}>
                    <Switch checked={eventInfo.hasEndDate} onChange={(event, checked) => setEventInfo({...eventInfo, hasEndDate: checked})} />
                    <MDTypography fontSize={15} fontWeight={"bold"}>{"Has End Date (Local Time)"}</MDTypography>
                  </MDBox>
                  {!eventInfo.hasEndDate ? null : (
                    <MDBox display={"flex"} flexDirection={"row"} alignItems={"center"} justifyContent={"space-between"}>
                      <LocalizationProvider dateAdapter={AdapterMoment} adapterLocale={"us"}>
                        <DatePicker
                          label="Date"
                          value={eventInfo.enddate}
                          onChange={(newDate) => {
                            setEventInfo({...eventInfo, enddate: newDate});
                          }}
                          renderInput={(params) => <TextField {...params} />}
                        />
                      </LocalizationProvider>
                      <LocalizationProvider dateAdapter={AdapterMoment}>
                        <TimePicker
                          label="Time"
                          value={eventInfo.endtime}
                          onChange={(newDate) => {
                            setEventInfo({...eventInfo, endtime: newDate});
                          }}
                          renderInput={(params) => <TextField {...params} />}
                        />
                      </LocalizationProvider>
                    </MDBox>
                  )}
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <MDButton color="secondary" onClick={() => setEventInfo({...eventInfo, show: false})}>Cancel</MDButton>
              <MDButton color="info" onClick={() => {
                handleAddEvent(eventInfo);
                setEventInfo({...eventInfo, show: false});
              }}>Add</MDButton>
            </DialogActions>
          </Dialog>
          
        </MDBox>
      </Grid>
    </Grid>
  );
}
