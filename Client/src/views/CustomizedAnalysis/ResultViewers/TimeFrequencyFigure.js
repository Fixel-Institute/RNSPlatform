/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useResizeDetector } from 'react-resize-detector';

import { Menu, MenuItem, DialogContent, Autocomplete, Grid, DialogActions, Dialog, TextField } from "@mui/material";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

import * as Math from "mathjs"
import colormap from "colormap";

import { PlotlyRenderManager } from "graphing-utility/Plotly";

import { usePlatformContext } from "context";
import { SessionController } from "database/session-control";
import { dictionary, dictionaryLookup } from "assets/translation";

function TimeFrequencyFigure({dataToRender, analysisId, resultId, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { participant_uid } = useParams();

  const [alert, setAlert] = useState(null);

  const [fig, setFig] = useState(null);
  const [cachedData, setCachedData] = useState([]);
  const [availableChannels, setAvailableChannels] = useState({active: "", options: []});
  const [data, setData] = useState({});
  const [renderData, setRenderData] = useState([]);
  const [coloraxis, setColorAxis] = useState({ show: false, limit: [-20,20], limit_temp: [-20,20] });
  
  const [contextMenu, setContextMenu] = useState(null);
  const [eventInfo, setEventInfo] = useState({
    name: "",
    time: 0,
    duration: 0,
    show: false
  });

  useEffect(() => {
    const fig = new PlotlyRenderManager(figureTitle, language);
    setFig(fig);
  }, []);

  useEffect(() => {
    setData({...dataToRender});
    setAvailableChannels({active: "", options: dataToRender.AllChannels})
  }, [dataToRender]);

  useEffect(() => {
    if (!fig) return;
    
    if (!fig.fresh) {
      fig.clearData();
    }

    const ax = fig.subplots(1, 1, {sharex: true, sharey: true});
    fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Time", language)}`, {fontSize: 15});
    fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Frequency", language)}`, {fontSize: 15});
    
    //fig.setScaleType("log", "y");
    //fig.setTickValue([0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000], "y");
    //fig.setYlim([-3, 2]);
    fig.setLayoutProps({ hovermode: "x", hoverdistance: 1 });
    fig.setLegend({ tracegroupgap: 5, xanchor: "right", y: 1 });

  }, [fig, availableChannels]);

  useEffect(() => {
    
  }, [availableChannels])

  useEffect(() => {
    if (!fig) return;

    let graphSeries = [];
    for (let i in data.Spectrum) {
      if (availableChannels.active == data.Spectrum[i].Spectrum.Channel) {
        var timeArray = Array(data.Spectrum[i].Spectrum.Time.length).fill(0).map((value, index) => new Date(data.Spectrum[i].Spectrum.StartTime*1000 + data.Spectrum[i].Spectrum.Time[index]*1000 + data.Spectrum[i].Alignment*1000));
        graphSeries.push({
          type: "surf",
          x: timeArray, y: data.Spectrum[i].Spectrum.Frequency, z: data.Spectrum[i].Spectrum.Power.map((a) => {
            return a.map((b) => 10*Math.log10(b));
          }),
          options: {
            zlim: coloraxis.limit,
            hovertemplate: `  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "Hertz", language)}<br>  %{x} <br>  %{z:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "dB", language)} <extra></extra>`,
            coloraxis: fig.createColorAxis({
              colorscale: "Jet",
              colorbar: {y: 0.5, len: 1},
              clim: coloraxis.limit,
            }),
          }
        });
      }
    }
    setRenderData(graphSeries);
  }, [availableChannels.active, coloraxis.limit, data]);

  const refreshRender = () => {
    let caxis = fig.getColorAxis();
    for (let i in caxis) {
      fig.setColorAxis(null, caxis[i]);
    }

    const ax = fig.getAxes()[0];
    for (let i in renderData) {
      if (renderData[i].type === "surf") {
        const caxis = fig.createColorAxis({
          colorscale: "Jet",
          colorbar: {y: 0.5, len: 1},
          clim: renderData[i].options.zlim,
        });

        fig.surf(renderData[i].x, renderData[i].y, renderData[i].z, {...renderData[i].options,
          coloraxis: caxis
        }, ax);
      }
    }
    fig.render();
  }

  useEffect(() => {
    if (!fig || !renderData) return;
    
    fig.traces = [];
    refreshRender();
    
    const ref = document.getElementById(figureTitle);
    if (ref) {
      ref.on("plotly_click", plotly_onClick);
      return () => {
        ref.removeListener("plotly_click", plotly_onClick);
      }
    };
  }, [fig, renderData]);

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

  const plotly_onClick = (data) => {
    setEventInfo((eventInfo) => {
      eventInfo.channel_name = data.points[0].data.name;
      eventInfo.channel = data.points[0].data.id;
      eventInfo.current_alignment = data.points[0].data.current_alignment;
      eventInfo.time = new Date(data.points[0].x).getTime();
      return {...eventInfo};
    });
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    document.getElementById(figureTitle).focus();
    setContextMenu( contextMenu === null ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, } : null );
  };

  return (
    <MDBox>
      <MDBox>
        <Autocomplete selectOnFocus clearOnBlur
          renderInput={(params) => (
            <TextField {...params} variant="standard" label={"Channel Selection"}/>
          )}
          isOptionEqualToValue={(option, value) => {
            return option === value;
          }}
          renderOption={(props, option) => <li {...props}>{option}</li>}
          value={availableChannels.active}
          options={availableChannels.options}
          onChange={(event, newValue) => {
            setAvailableChannels({...availableChannels, active: newValue});
          }}
        />
      </MDBox>
      <MDBox ref={ref} id={figureTitle} style={{marginTop: 5, marginBottom: 10, height: 400, width: "100%", display: ""}}
        onContextMenu={onContextMenu}
      />

      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        disableScrollLock={true}
      >
        <MenuItem onClick={() => {
          setContextMenu(null);
          setColorAxis({...coloraxis, limit_temp: coloraxis.limit, show: true});
          }}>{"Adjust Colormap"}</MenuItem>
      </Menu>
      
      <Dialog open={coloraxis.show} onClose={() => setColorAxis({...coloraxis, show: false})}>
        <MDBox px={2} pt={2} sx={{minWidth: 500}}>
          <MDTypography variant="h5">
            {"Set Colorbar Axis Range (View Only)"} 
          </MDTypography>
        </MDBox>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} style={{display: "flex", flexDirection: "column"}}>
              <TextField
                variant="standard"
                margin="dense"
                id={"caxis-lowerlimit"}
                type={"number"}
                label="Lower Limit"
                placeholder={"Lower Limit"}
                value={coloraxis.limit_temp[0]}
                onChange={(event) => {
                  setColorAxis({...coloraxis, limit_temp: [event.target.value, coloraxis.limit_temp[1]]})
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} style={{display: "flex", flexDirection: "column"}}>
              <TextField
                variant="standard"
                margin="dense"
                id={"caxis-upperlimit"}
                type={"number"}
                label="Upper Limit"
                placeholder={"Upper Limit"}
                value={coloraxis.limit_temp[1]}
                onChange={(event) => setColorAxis({...coloraxis, limit_temp: [coloraxis.limit_temp[0], event.target.value]})}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={() => setColorAxis({...coloraxis, show: false})}>Cancel</MDButton>
          <MDButton color="info" onClick={() => {
            setColorAxis({...coloraxis, limit: coloraxis.limit_temp, show: false});
          }}>Set</MDButton>
        </DialogActions>
      </Dialog>
      
    </MDBox>
  );
}

export default TimeFrequencyFigure;