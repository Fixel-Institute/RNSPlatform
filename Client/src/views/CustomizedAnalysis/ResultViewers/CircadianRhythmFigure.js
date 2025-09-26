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
import { useParams } from "react-router-dom";
import { useResizeDetector } from 'react-resize-detector';

import LoadingProgress from "components/LoadingProgress";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import { Autocomplete, Dialog, DialogContent, TextField, DialogActions, Grid, Menu, MenuItem } from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";

import * as math from "mathjs"
import { PlotlyRenderManager } from "graphing-utility/Plotly";
import { SessionController } from "database/session-control";

import { usePlatformContext } from "context";
import { dictionary, dictionaryLookup } from "assets/translation";

const filter = createFilterOptions();

function CircadianRhythmFigure({dataToRender, analysisId, resultId, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { participant_uid } = useParams();

  const [alert, setAlert] = useState(null);
  
  const [fig, setFig] = useState(null);
  const [data, setData] = useState(null);
  const [renderData, setRenderData] = useState(null);
  const [cachedData, setCachedData] = useState([]);
  const [availableChannels, setAvailableChannels] = useState({active: "", options: []});

  useEffect(() => {
    const fig = new PlotlyRenderManager(figureTitle, language);
    setFig(fig);
  }, [figureTitle]);

  useEffect(() => {
    setData({...dataToRender});
    setCachedData(dataToRender.ActiveChannel);
    setAvailableChannels({active: "", options: dataToRender.AllChannels});
  }, [dataToRender]);

  useEffect(() => {
    if (!cachedData.includes(availableChannels.active)) {
      SessionController.query("/api/queryCustomizedAnalysis", {
        RequestType: "AnalysisOutput",
        ParticipantId: participant_uid,
        AnalysisId: analysisId,
        ResultId: resultId,
        ActiveChannels: [availableChannels.active]
      }).then((response) => {
        setCachedData((cachedData) => [...cachedData, availableChannels.active]);
        setData((data) => {
          data.Signal.push(...response.data.Signal);
          return {...data};
        });
      }).catch((error) => {
        SessionController.displayError(error, setAlert);
      });
    }
  }, [availableChannels.active])

  useEffect(() => {
    if (!fig) return;
    
    if (!fig.fresh) {
      fig.clearData();
    }

    const ax = fig.subplots(1, 1, {sharex: true, sharey: true});
    fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Time", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "Local", language)})`, {fontSize: 15}, ax[0]);
    fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)}`, {fontSize: 15}, ax[0]);
    fig.setLayoutProps({
      hovermode: "xy"
    });

    fig.setAxisProps({
      tickformat: "%H:%M"
    }, "x", ax[0])
    
    if (!fig.fresh) {
      refreshRender();
    }

  }, [fig]);

  useEffect(() => {
    if (!fig) return;
    let graphSeries = [{
      type: "line", x: [], y: [], error_y: [],
      line_options: {
        linewidth: 2,
        color: "#000000",
        hovertemplate: `  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "AU", language)}<extra></extra>`,
        showlegend: false
      }, 
      shade_options: {
        color: "#000000",
        alpha: 0.3,
        showlegend: false
      }, 
    }];

    let xData = [], yData = [];
    for (let i in data.Signal) {
      if (availableChannels.active == data.Signal[i].SignalSeries.ChannelNames) {
        for (let j in data.Signal[i].SignalSeries.Epochs) {
          xData.push(...data.Signal[i].SignalSeries.Epochs[j].Time.map((a) => (a % 86400)*1000));
          yData.push(...data.Signal[i].SignalSeries.Epochs[j].Data);
        }
      }
    }

    const timezoneOffset = new Date().getTimezoneOffset();
    const window = 1200000;
    const defaultTimeArray = new Array(145).fill(0).map((a,i) => i*600000);
    const inRange = (time, ref, window) => {
      if (math.abs(time - ref) < window) return true; 
      if (math.abs(time+86400 - ref) < window) return true; 
      if (math.abs(time-86400 - ref) < window) return true; 
      return false
    }

    for (let i = 0; i < defaultTimeArray.length; i++) {
      graphSeries[0].x.push(new Date(defaultTimeArray[i]+timezoneOffset*60000));
      if (i == 0 || i == 144) {
        const windowedData = yData.filter((a,t) => inRange(xData[t],defaultTimeArray[0],window) || inRange(xData[t],defaultTimeArray[144],window));
        if (windowedData.length > 0) {
          graphSeries[0].y.push(math.mean(windowedData));
          graphSeries[0].error_y.push(math.std(windowedData)/math.sqrt(windowedData.length)*2);
        } else {
          graphSeries[0].y.push(0);
          graphSeries[0].error_y.push(0);
        }
      } else {
        const windowedData = yData.filter((a,t) => inRange(xData[t],defaultTimeArray[i],window));
        if (windowedData.length > 0) {
          graphSeries[0].y.push(math.mean(windowedData));
          graphSeries[0].error_y.push(math.std(windowedData)/math.sqrt(windowedData.length)*2);
        } else {
          graphSeries[0].y.push(0);
          graphSeries[0].error_y.push(0);
        }
      }
    }
    setRenderData(graphSeries);
  }, [fig, availableChannels.active, data]);

  const refreshRender = () => {
    const ax = fig.getAxes();
    for (let i in renderData) {
      if (renderData[i].type === "line") {
        fig.shadedErrorBar(renderData[i].x, renderData[i].y, renderData[i].error_y, renderData[i].line_options, renderData[i].shade_options, ax[0]);
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

  return <MDBox>
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
      <MDBox ref={ref} id={figureTitle} style={{marginTop: 5, marginBottom: 10, height: 600, width: "100%", display: ""}}/>
  </MDBox>;
}

export default CircadianRhythmFigure;