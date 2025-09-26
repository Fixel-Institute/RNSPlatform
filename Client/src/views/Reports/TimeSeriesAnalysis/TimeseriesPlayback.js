/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useCallback, useState, useEffect, useMemo } from "react";
import { useResizeDetector } from 'react-resize-detector';

import LoadingProgress from "components/LoadingProgress";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import { Autocomplete, Dialog, DialogContent, TextField, DialogActions, Grid, Menu, MenuItem } from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";

import * as Math from "mathjs"
import { PlotlyRenderManager } from "graphing-utility/Plotly";

import { usePlatformContext } from "context";
import { dictionary, dictionaryLookup } from "assets/translation";

const filter = createFilterOptions();

function TimeseriesPlayback({dataToRender}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;

  const [contextMenu, setContextMenu] = useState(null);
  const [eventInfo, setEventInfo] = useState({ name: "", time: 0, duration: 0, show: false });
  const [dataAlignment, setDataAlignment] = useState({ show: false, alignment: 0 });
  const [coloraxis, setColorAxis] = useState({ show: false, limit: [-20,20], limit_temp: [-20,20] });

  const [fig, setFig] = useState(null);
  const [renderData, setRenderData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const fig = new PlotlyRenderManager("Timeseries Playback", language);
    setFig(fig);
  }, []);

  useEffect(() => {
    if (!fig) return;
    if (!dataToRender) return;

    setIsPlaying(false);
    
    if (!fig.fresh) {
      fig.clearData();
      fig.fresh = true;
    }

    const ax = fig.subplots(1, 1, {sharey: false, sharex: true});
    fig.setYlim(dataToRender.ylim);
    fig.setXlim(dataToRender.xlim);
    fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Amplitude", language)} (Unit)`, {fontSize: 15});
    fig.setSubtitle(dataToRender.options.name);

    setRefresh((a) => a+1);
  }, [fig, dataToRender]);

  useEffect(() => {
    if (!fig) return;

    if (!dataToRender.xlim) {
      dataToRender.xlim = [dataToRender.x[0], dataToRender.x[dataToRender.x.length - 1]];
    }
    let graphSeries = [dataToRender];
    setRenderData(graphSeries);
  }, [fig, dataToRender, coloraxis.limit]);

  const refreshRender = () => {
    let caxis = fig.getColorAxis();
    for (let i in caxis) {
      fig.setColorAxis(null, caxis[i]);
    }

    for (let i in renderData) {
      if (renderData[i].type === "line") {
        fig.plot(renderData[i].x, renderData[i].y, renderData[i].options);
      } else if (renderData[i].type === "surf") {
        const caxis = fig.createColorAxis({
          colorscale: "Jet",
          colorbar: {y: 0.5, len: 1},
          clim: renderData[i].options.zlim,
        });

        fig.surf(renderData[i].x, renderData[i].y, renderData[i].z, {...renderData[i].options,
          coloraxis: caxis
        });
      } 
    }
    fig.render();
  };

  useEffect(() => {
    if (isPlaying) {
      const currentTime = new Date().getTime();
      const interval = setInterval(() => {
        let updatedTime = new Date().getTime();
        let elapsedTime = updatedTime - currentTime;
        if (typeof dataToRender.xlim[0] === "object") {
          fig.setXlim([new Date(dataToRender.xlim[0].getTime() + elapsedTime - 3000), new Date(dataToRender.xlim[0].getTime() + elapsedTime + 3000)]);
        } else if (typeof dataToRender.xlim[0] === "number") {
          fig.setXlim([dataToRender.xlim[0] + elapsedTime - 3, dataToRender.xlim[1] + elapsedTime + 3]);
        }
        fig.render();
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!fig || !renderData) return;
    
    fig.traces = [];
    refreshRender();
    
    const ref = document.getElementById("Timeseries Playback");
    if (ref) {
      ref.on("plotly_click", plotly_onClick);
      return () => {
        ref.removeListener("plotly_click", plotly_onClick);
      }
    };
  }, [fig, refresh, renderData]);

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
    document.getElementById("Timeseries Playback").focus();
    setContextMenu( contextMenu === null ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, } : null );
  };

  return useMemo(() => (
    <MDBox display={"flex"} flexDirection={"column"} style={{overflow: "hidden"}}>
      <MDButton onClick={() => {
        setIsPlaying((state) => !state);
      }}>
        <MDTypography variant="h5" fontWeight="bold">
          {isPlaying ? "Pause" : "Start"}
        </MDTypography>
      </MDButton>
      <MDBox ref={ref} id={"Timeseries Playback"} onContextMenu={onContextMenu} 
        style={{marginTop: 5, marginBottom: 10, height: 450, width: "100%", display: ""}}
      >
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
        <MDButton color="secondary" onClick={() => setEventInfo({...eventInfo, show: false})}>Cancel</MDButton>
        <MDButton color="info" onClick={() => {
            setColorAxis({...coloraxis, limit: coloraxis.limit_temp, show: false});
        }}>Set</MDButton>
        </DialogActions>
      </Dialog>
      
      </MDBox>
    </MDBox>
  ), [renderData, coloraxis, eventInfo, dataAlignment, contextMenu]);
}

export default TimeseriesPlayback;