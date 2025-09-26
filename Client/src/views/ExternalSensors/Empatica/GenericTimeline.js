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

import colormap from "colormap";
import { TwitterPicker, BlockPicker } from "react-color";

import { Card, Menu, MenuItem, Dialog, DialogContent, Grid, IconButton, Popover, TextField, DialogActions } from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";

import { dictionary, dictionaryLookup } from "assets/translation";
import { PlotlyRenderManager, downsampleLTTB } from "graphing-utility/Plotly";
import { usePlatformContext } from "context";

const filter = createFilterOptions();

export default function GenericTimeline({data, availableChannels, annotations, handleAddEvent, handleDeleteEvent, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;

  const [contextMenu, setContextMenu] = useState(null);
  const [eventInfo, setEventInfo] = useState({ name: "", time: 0, duration: 0, show: false });
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

    const ax = fig.subplots(availableChannels.active.length, 1, {sharex: true, sharey: true});
    let subplotIds = [];
    for (let i in availableChannels.active) {
      subplotIds.push(`${availableChannels.active[i]}`);
      fig.setYlabel(``, {fontSize: 15}, ax[i]);
      fig.setSubtitle(`${availableChannels.active[i]}`,ax[i]);
    }
    fig.setSubplotId(subplotIds);
    
    fig.setLegend({ tracegroupgap: 5, xanchor: "left", y: 0.5, });
    fig.setLayoutProps({ barmode: "group", hovermode: "x", hoverdistance: 1 });

    if (!fig.fresh) {
      let caxis = fig.getColorAxis();
      for (let i in caxis) {
        fig.setColorAxis(null, caxis[i]);
      }

      for (let i in renderData) {
        const subAx = fig.getAxes(renderData[i].axName);
        if (subAx) {
          if (renderData[i].type === "lineseries") {
            fig.plot(renderData[i].x, renderData[i].y, renderData[i].options, subAx);
          }  else if (renderData[i].type == "bar") {
            fig.setScaleType("category", "y", subAx);
            fig.bar(renderData[i].x, renderData[i].y, renderData[i].base, renderData[i].options, subAx);
          }
        }
      }
      fig.render();
    }

  }, [fig, availableChannels]);

  useEffect(() => {
    if (!fig) return;

    let lineSeries = [];
    for (let key in data) {
      if (!availableChannels.active.includes(key)) continue;

      for (let i in data[key]) {
        const xData = [];
        for (let t in data[key][i].Time) {
          xData.push(new Date(data[key][i].Time[t]*1000 + data[key][i]["StartTime"]*1000));
          if (data[key][i].Duration) {
            xData.push(new Date(data[key][i].Time[t]*1000 + data[key][i]["StartTime"]*1000 + data[key][i].Duration[t]*1000));
          }
        }

        const yData = [];
        for (let t in data[key][i].Time) {
          yData.push(data[key][i]["Data"][t]);
          if (data[key][i].Duration) {
            yData.push(data[key][i]["Data"][t]);
          }
        }
        if ( yData.filter((a,i) => yData[i]).length === 0 ) continue;

        const visualizeData = downsampleLTTB(xData, yData, 100000);

        lineSeries.push({
          type: "lineseries",
          x: visualizeData.x.filter((a,i) => visualizeData.y[i]), y: visualizeData.y.filter((a,i) => visualizeData.y[i]),
          options: {
            id: key,
            name: key,
            showlegend: false,
            linewidth: 2,
            line: {shape: "hvh"},
            color: "#000000",
            hovertemplate: "%{y}<extra></extra>"
          }, 
          axName: key
        });
      }
    }
    
    setRenderData(lineSeries);
    
  }, [fig, data, annotations]);

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
        if (renderData[i].type === "annotations") {
          renderData[i].options.color = annotationState[renderData[i].options.name] ? annotationState[renderData[i].options.name].color : "#00FF00";
          renderData[i].options.hidden = annotationState[renderData[i].options.name] ? !annotationState[renderData[i].options.name].show : false;
        }
      }
      return [...renderData];
    })
  }, [fig, annotationState]);

  useEffect(() => {
    
  }, [annotationState]);

  useEffect(() => {
    if (!fig || !renderData) return;

    fig.traces = [];
    let yLim = {};
    let clim = {};
    
    for (let i in renderData) {
      const ax = fig.getAxes(renderData[i].axName);
      if (renderData[i].type === "surf" && ax) {
        if (!clim[renderData[i].axName]) {
          clim[renderData[i].axName] = {
            caxis: fig.createColorAxis({
              colorscale: "Jet",
              colorbar: {y: (ax.ydomain[0]+ax.ydomain[1])/2, len: ax.ydomain[1]-ax.ydomain[0]},
              clim: renderData[i].options.zlim,
            }),
            limits: [0,0]
          }
        }
      }

      if (renderData[i].type == "lineseries") {
        if (!yLim[renderData[i].axName]) yLim[renderData[i].axName] = [0,1];
        if (!renderData[i].options.hidden && ax) {
          const currentMax = Math.max(renderData[i].y.filter((a) => a !== null));
          if (currentMax > yLim[renderData[i].axName][1]) {
            yLim[renderData[i].axName][1] = currentMax*1.1;
            fig.setYlim(yLim[renderData[i].axName], ax);
          };
          fig.setScaleType("linear", "y", ax);
          fig.plot(renderData[i].x, renderData[i].y, renderData[i].options, ax);
        }
      } else if (renderData[i].type === "surf") {
        if (!renderData[i].options.hidden && ax) {
          fig.setScaleType("linear", "y", ax);
          if (renderData[i].options.zlim[0] < clim[renderData[i].axName].limits[0] || clim[renderData[i].axName].limits[0] == 0) clim[renderData[i].axName].limits[0] = renderData[i].options.zlim[0];
          if (renderData[i].options.zlim[1] > clim[renderData[i].axName].limits[1] || clim[renderData[i].axName].limits[1] == 0) clim[renderData[i].axName].limits[1] = renderData[i].options.zlim[1];
          fig.surf(renderData[i].x, renderData[i].y, renderData[i].z, {...renderData[i].options,
            coloraxis: clim[renderData[i].axName].caxis
          }, ax);
        }
      } else if (renderData[i].type == "bar") {
        if (!renderData[i].options.hidden && ax) {
          fig.setScaleType("category", "y", ax);
          fig.bar(renderData[i].x, renderData[i].y, renderData[i].base, renderData[i].options, ax);
        }
      }
    }

    for (let key in clim) {
      fig.setCLim(clim[key].limits, clim[key].caxis);
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
              setEventInfo({...eventInfo, name: "", show: true});
            }}>{"Add New Event"}</MenuItem>
            <MenuItem onClick={() => {
              setContextMenu(null);
              handleDeleteEvent(eventInfo);
            }}>{"Delete Event"}</MenuItem>
          </Menu>

          <Dialog open={eventInfo.show} onClose={() => setEventInfo({...eventInfo, show: false})}>
            <MDBox px={2} pt={2} sx={{minWidth: 500}}>
              <MDTypography variant="h5">
                {"New Custom Event"} 
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
                  <TextField
                    variant="standard"
                    margin="dense"
                    type={"number"}
                    label="Event Duration"
                    placeholder={"0 for Instant Event"}
                    value={eventInfo.duration}
                    onChange={(event) => setEventInfo({...eventInfo, duration: event.target.value})}
                  />
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
