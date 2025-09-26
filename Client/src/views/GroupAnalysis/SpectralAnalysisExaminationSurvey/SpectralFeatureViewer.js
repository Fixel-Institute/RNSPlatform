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
import colormap from "colormap";
import * as math from "mathjs";

import { Autocomplete, Dialog, DialogContent, TextField, DialogActions, Grid, Menu, MenuItem } from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";

import LoadingProgress from "components/LoadingProgress";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import FormField from "components/MDInput/FormField";
import MDButton from "components/MDButton";

import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';

import { PlotlyRenderManager } from "graphing-utility/Plotly";

import { SessionController } from "database/session-control";
import { usePlatformContext } from "context";
import { dictionary, dictionaryLookup } from "assets/translation";

const filter = createFilterOptions();

function SpectralFeatureViewer({figureTitle, participant_uid, recordings, onClose}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;

  const [fig, setFig] = useState(null);
  const [renderData, setRenderData] = useState(null);
  const [cacheData, setCacheData] = useState([]);
  const [activeDevice, setActiveDevice] = useState("");
  const [recording, setRecording] = useState("");
  const [viewType, setViewType] = useState("Power Spectral Density");
  const [timerange, setTimerange] = useState({device: "", start: null, end: null});

  const [alert, setAlert] = useState(null);

  useEffect(() => {
    const fig = new PlotlyRenderManager(figureTitle, language);
    setFig(fig);
  }, [figureTitle]);

  useEffect(() => {
    if (!recording) return;

    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryGroupAnalysis", {
      AnalysisName: "ExtractSpectralFeaturesDuringSurvey", 
      RequestType: "RequestPSD",
      ParticipantId: participant_uid,
      Contact: recording
    }).then((response) => {
      setCacheData([response.data]);
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  }, [recording])

  useEffect(() => {
    if (!fig) return;
    
    if (!fig.fresh) {
      fig.clearData();
    }

    fig.subplots(1, 1, {sharey: false, sharex: false});
    fig.setScaleType("log", "y");
    fig.setTickValue([0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000], "y");
    fig.setYlim([-3, 2]);
    fig.setXlim([0, 100]);
    fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Frequency", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "Hertz", language)})`, {fontSize: 15});
    fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)})`, {fontSize: 15});

    if (!fig.fresh) {
      refreshRender();
    }

  }, [fig]);

  useEffect(() => {
    if (!fig) return;
    
    if (viewType == "Power Spectral Density") {
      fig.setScaleType("log", "y");
      fig.setTickValue([0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000], "y");
      fig.setYlim([-3, 2]);
      fig.setXlim([0, 100]);
      fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Frequency", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "Hertz", language)})`, {fontSize: 15});
      fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)})`, {fontSize: 15});

    } else if (viewType == "Normalized PSD") {
      fig.setScaleType("linear", "y");
      fig.setTickValue([-3, -2, -1, 0, 1, 2, 3, 4, 5], "y");
      fig.setYlim([-3, 5]);
      fig.setXlim([0, 100]);
      fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Frequency", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "Hertz", language)})`, {fontSize: 15});
      fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)})`, {fontSize: 15});

    } 

  }, [viewType])

  useEffect(() => {
    if (!fig) return;
    if (cacheData.length == 0) return;

    let graphSeries = [];

    for (let i in cacheData) {
      if (viewType == "Power Spectral Density") {
        graphSeries.push({
          type: "line", x: cacheData[i].Frequency, y: cacheData[i].PowerSpectrum, error_y: cacheData[i].StdPower,
          line_options: {
            linewidth: 2,
            name: cacheData[i].Contact,
            legendgroup: cacheData[i].Contact,
            color: "#000000",
            hovertemplate: `  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)}<extra></extra>`,
            showlegend: true
          }, 
          shade_options: {
            legendgroup: cacheData[i].Contact,
            color: "#000000",
            alpha: 0.3,
            showlegend: false
          }, 
          figName: figureTitle
        });
      } else if (viewType == "Normalized PSD") {
        graphSeries.push({
          type: "line", x: cacheData[i].Frequency, y: cacheData[i].PowerSpectrum.map((a,k) => a / cacheData[i].AperiodicComponent[k]), 
                                                   error_y: cacheData[i].StdPower.map((a,k) => a / cacheData[i].AperiodicComponent[k]),
          line_options: {
            linewidth: 2,
            name: cacheData[i].Contact,
            legendgroup: cacheData[i].Contact,
            color: "#000000",
            hovertemplate: `  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)}<extra></extra>`,
            showlegend: true
          }, 
          shade_options: {
            legendgroup: cacheData[i].Contact,
            color: "#000000",
            alpha: 0.3,
            showlegend: false
          }
        });
      }
    }
    
    setRenderData(graphSeries);
  }, [fig, viewType, cacheData]);

  const refreshRender = () => {
    for (let i in renderData) {
      if (renderData[i].type === "line") {
        fig.shadedErrorBar(renderData[i].x, renderData[i].y, renderData[i].error_y, renderData[i].line_options, renderData[i].shade_options);
      } else if (renderData[i].type === "bar") {
        fig.bar(renderData[i].x, renderData[i].y, renderData[i].base, renderData[i].options);
      }
    }
    fig.render();
  }

  useEffect(() => {
    if (!fig || !renderData) return;
    
    fig.traces = [];
    refreshRender();
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

  return useMemo(() => (
    <MDBox display={"flex"} flexDirection={"column"}>
      {alert}
      <MDBox px={2} py={1}>
        <Autocomplete
          disableClearable
          value={recording}
          options={recordings.map((a) => a.Date + " " + a.Contact)}
          onChange={(event, value) => setRecording(value)}
          renderInput={(params) => (
            <FormField
            {...params}
            label={"Channel Selector"}
            InputLabelProps={{ shrink: true }}
            />
          )}
        />
      </MDBox>
      <MDBox px={2} py={1}>
        <Autocomplete
          disableClearable
          value={viewType}
          options={["Power Spectral Density", "Normalized PSD"]}
          onChange={(event, value) => setViewType(value)}
          renderInput={(params) => (
            <FormField
            {...params}
            label={"Result Type Selector"}
            InputLabelProps={{ shrink: true }}
            />
          )}
        />
      </MDBox>
      <MDBox ref={ref} id={figureTitle} style={{marginTop: 5, marginBottom: 10, height: 600, width: "100%", display: ""}}/>
    </MDBox>
  ), [renderData, alert, recording]);
}

export default SpectralFeatureViewer;