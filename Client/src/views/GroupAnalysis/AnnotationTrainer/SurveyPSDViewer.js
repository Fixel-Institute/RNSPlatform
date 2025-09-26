/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import {useCallback, useState, useEffect, useMemo} from "react";
import {useResizeDetector} from "react-resize-detector";
import colormap from "colormap";
import * as math from "mathjs";

import { Autocomplete, Grid } from "@mui/material";
import MDBox from "components/MDBox";
import FormField from "components/MDInput/FormField";
import LoadingProgress from "components/LoadingProgress";

import { PlotlyRenderManager } from "graphing-utility/Plotly";
import { formatSegmentString, matchArray } from "database/helper-function";

import { usePlatformContext } from "context";
import { dictionary, dictionaryLookup } from "assets/translation";
import { SessionController } from "database/session-control";

function SurveyPSDViewer({dataToRender, setCenterFreq, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  
  const [fig, setFig] = useState(null);
  const [renderData, setRenderData] = useState(null);
  const [cacheData, setCacheData] = useState(null);
  const [options, setOptions] = useState({type: "Channel", options: [], value: ""});
  const [alert, setAlert] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [centerFrequency, setCenterFrequency] = useState([]);
  const [predictedFrequency, setPredictedFrequency] = useState([]);

  useEffect(() => {
    setFig(new PlotlyRenderManager(figureTitle, language));
  }, [figureTitle]);

  useEffect(() => {
    if (!dataToRender) return;
    
    setCenterFrequency(dataToRender.CenterFrequency || []);
    setPredictedFrequency(dataToRender.PredictedCenterFrequency || []);
  }, [dataToRender]);

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
    fig.setSubtitle("Event Averaged PSDs");

    if (!fig.fresh) {
      refreshRender(fig);
    }

  }, [fig]);

  useEffect(() => {
    if (!dataToRender || !fig) return;

    const colors = colormap({
      colormap: 'rainbow',
      nshades: 101,
      format: 'hex',
      alpha: 1,
    });

    let graphSeries = [];
    graphSeries.push({
      type: "line",
      x: dataToRender.Frequency, y: dataToRender.PSD, error_y: dataToRender.StdPower.map((a) => a/5),
      line_options: {
          name: "",
          color: "#000000",
          linewidth: 2,
          hovertemplate: `  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)}<extra></extra>`,
          showlegend: false
      }, 
      shade_options: {
          color: "#000000",
          alpha: 0.3,
          showlegend: false
      },
    });

    if (centerFrequency) {
      for (let i in centerFrequency) {
        graphSeries.push({
          type: "centerFreq", x: [centerFrequency[i], centerFrequency[i]], y: [0,100],
          options: {
            linewidth: 2,
            name: "Center Frequency: " + centerFrequency[i].toFixed(1) + " Hz",
            color: "#000000",
            hovertemplate: `  %{x:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "Hz", language)}<extra></extra>`,
            showlegend: false
          }, 
          figName: figureTitle
        });
      }
    }

    if (predictedFrequency) {
      for (let i in predictedFrequency) {
        graphSeries.push({
          type: "centerFreq", x: [predictedFrequency[i].Frequency, predictedFrequency[i].Frequency], y: [0,100],
          options: {
            linewidth: 2,
            name: "Center Frequency: " + predictedFrequency[i].Frequency.toFixed(1) + " Hz (" + predictedFrequency[i].Probability.toFixed(2) + ")",
            color: "#BB0000",
            hovertemplate: `  %{x:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "Hz", language)}<extra></extra>`,
            showlegend: true
          }, 
          figName: figureTitle
        });
      }
    }

    setRenderData(graphSeries);
  }, [fig, dataToRender, centerFrequency, options.value]);

  const refreshRender = (fig) => {
    for (let i in renderData) {
      if (renderData[i].type === "line") {
        fig.shadedErrorBar(renderData[i].x, renderData[i].y, renderData[i].error_y, renderData[i].line_options, renderData[i].shade_options);
      } else if (renderData[i].type === "centerFreq") {
        fig.plot(renderData[i].x, renderData[i].y, renderData[i].options);
      }
    }
    fig.render();
  }

  useEffect(() => {
    if (!fig) return;

    fig.traces = [];
    refreshRender(fig);

    const ref = document.getElementById(figureTitle);
    if (ref && ref.on) {
      ref.on("plotly_click", plotly_onClick);
    };
    setRefresh((refresh) => {
      return refresh += 1;
    });

    return () => {
      const ref = document.getElementById(figureTitle);
      if (ref && ref.removeListener) {
        ref.removeListener("plotly_click", plotly_onClick);
      };
    }
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

  var updateTimeout = null;
  var plotly_singleclicked = false;
  const plotly_onClick = (data) => {
    if (plotly_singleclicked) {
      plotly_singleclicked = false;
      clearTimeout(updateTimeout);
    } else {
      plotly_singleclicked = true;
      updateTimeout = setTimeout(function() {
        setCenterFrequency((centerFrequency) => {
          if (centerFrequency.includes(data["points"][0]["x"])) {
            centerFrequency = centerFrequency.filter(freq => freq !== data["points"][0]["x"]);
          } else {
            centerFrequency = [...centerFrequency, data["points"][0]["x"]];
          }

          setAlert(<LoadingProgress/>);
          SessionController.query("/api/queryGroupAnalysis", {
            AnalysisName: "AnnotationTrainer", 
            RequestType: "UpdateExpertLabel",
            ParticipantId: dataToRender.ParticipantId,
            Date: dataToRender.Date,
            Contact: dataToRender.Contact,
            Label: centerFrequency
          }).then((response) => {
            setAlert(null);
          }).catch((error) => {
            SessionController.displayError(error, setAlert);
          });

          setCenterFreq(centerFrequency);
          return centerFrequency;
        });
        plotly_singleclicked = false
      }, 300);
    }
  };

  return useMemo(() => (
    <Grid container spacing={0}>
      {alert}
      <Grid key={figureTitle} item xs={7}>
        <MDBox ref={ref} id={figureTitle} style={{height: 900, width: "100%"}}/>
      </Grid>
    </Grid>
  ), [alert, refresh]);
}

export default SurveyPSDViewer;