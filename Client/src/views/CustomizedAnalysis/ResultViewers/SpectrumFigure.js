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

import { Menu, MenuItem, DialogContent, Autocomplete, TextField } from "@mui/material";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import * as Math from "mathjs"
import colormap from "colormap";

import { PlotlyRenderManager } from "graphing-utility/Plotly";

import { usePlatformContext } from "context";
import { SessionController } from "database/session-control";
import { dictionary, dictionaryLookup } from "assets/translation";

function SpectrumFigure({dataToRender, analysisId, resultId, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { participant_uid } = useParams();

  const [alert, setAlert] = useState(null);

  const [fig, setFig] = useState(null);
  const [cachedData, setCachedData] = useState([]);
  const [availableChannels, setAvailableChannels] = useState({active: "", options: []});
  const [data, setData] = useState({});
  const [renderData, setRenderData] = useState([]);
  
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
    fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)}`, {fontSize: 15}, ax);
    fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Frequency", language)}`, {fontSize: 15}, ax);
    
    fig.setScaleType("log", "y");
    fig.setTickValue([0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000], "y");
    fig.setYlim([-3, 2]);
    fig.setLayoutProps({ hovermode: "x", hoverdistance: 1 });
    fig.setLegend({ tracegroupgap: 5, xanchor: "right", y: 1 });

  }, [fig, availableChannels]);

  useEffect(() => {
    
  }, [availableChannels])

  useEffect(() => {
    if (!fig) return;

    let uniqueLabels = [];
    for (let i in data.Spectrum) {
      for (let j in data.Spectrum[i].PSDSeries.Spectrum) {
        if (availableChannels.active == data.Spectrum[i].PSDSeries.Spectrum[j].Channel) {
          if (!uniqueLabels.includes(data.Spectrum[i].PSDSeries.Spectrum[j].Label)) {
            uniqueLabels.push(data.Spectrum[i].PSDSeries.Spectrum[j].Label);
          }
        }
      }
    }

    const colors = colormap({
      colormap: 'rainbow',
      nshades: uniqueLabels.length > 9 ? uniqueLabels.length : 9,
      format: 'hex',
      alpha: 1,
    });

    let graphSeries = [];
    for (let i in data.Spectrum) {
      for (let j in data.Spectrum[i].PSDSeries.Spectrum) {
        if (availableChannels.active == data.Spectrum[i].PSDSeries.Spectrum[j].Channel) {
          const nShades = uniqueLabels.indexOf(data.Spectrum[i].PSDSeries.Spectrum[j].Label);
          graphSeries.push({
            type: "line",
            x: data.Spectrum[i].PSDSeries.Spectrum[j].Frequency, y: data.Spectrum[i].PSDSeries.Spectrum[j].Power,
            xlim: [data.Spectrum[i].PSDSeries.Spectrum[j].Frequency[0],data.Spectrum[i].PSDSeries.Spectrum[j].Frequency[data.Spectrum[i].PSDSeries.Spectrum[j].Frequency.length-1]], 
            options: {
              id: data.Spectrum[i].PSDSeries.Spectrum[j].Label,
              name: data.Spectrum[i].PSDSeries.Spectrum[j].Label,
              legendgroup: data.Spectrum[i].PSDSeries.Spectrum[j].Label,
              linewidth: 2,
              color: colors[nShades],
              showlegend: Boolean(data.Spectrum[i].PSDSeries.Spectrum[j].Label),
              hovertemplate: `  %{y:.2f} ${""}<extra></extra>`,
            },
          });
        }
      }
    }
    setRenderData(graphSeries);
  }, [availableChannels.active, data]);

  const refreshRender = () => {
    fig.traces = [];
    const ax = fig.getAxes();
    for (let i in renderData) {
      if (renderData[i].type === "line") {
        fig.plot(renderData[i].x, renderData[i].y, renderData[i].options, ax);
        fig.setXlim(renderData[i].xlim);
      }
    }
    fig.render();
  }

  useEffect(() => {
    if (!fig || !renderData) return;
    
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
    </MDBox>
  );
}

export default SpectrumFigure;