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

import { Grid } from "@mui/material";
import MDBox from "components/MDBox";

import { PlotlyRenderManager } from "graphing-utility/Plotly";
import { formatSegmentString, matchArray } from "database/helper-function";

import { usePlatformContext } from "context";
import { dictionary, dictionaryLookup } from "assets/translation";

function ChronicSnapshots({dataToRender, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  
  const [figGroup, setFigGroup] = useState({});
  const [fig, setFig] = useState(null);
  const [renderData, setRenderData] = useState(null);
  const [cacheData, setCacheData] = useState(null);

  const [refresh, setRefresh] = useState(0);
  const [centerFreq, setCenterFreq] = useState(22);

  useEffect(() => {
    setFigGroup(() => {
      return {
        [figureTitle]: new PlotlyRenderManager(figureTitle, language),
        [figureTitle + "_Boxplot"]: new PlotlyRenderManager(figureTitle + "_Boxplot", language)
      }
    });
  }, [figureTitle]);

  useEffect(() => {
    for (let key in figGroup) {
      const fig = figGroup[key];
      if (!fig.fresh) {
        fig.clearData();
      }
      
      if (key.endsWith("Boxplot")) {
        const ax = fig.subplots(1, 1, {sharey: false, sharex: false});
        fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)})`, {fontSize: 15});

      } else {
        fig.subplots(1, 1, {sharey: false, sharex: false});
        fig.setScaleType("log", "y");
        fig.setTickValue([0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000], "y");
        fig.setYlim([-3, 2]);
        fig.setXlim([0, 100]);
        fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Frequency", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "Hertz", language)})`, {fontSize: 15});
        fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)})`, {fontSize: 15});
        fig.setSubtitle(key);

      }
      if (!fig.fresh) {
        refreshRender(fig, key);
      }
    }
  }, [figGroup]);

  useEffect(() => {
    if (dataToRender.length == 0) return;

    const colors = colormap({
      colormap: 'bluered',
      nshades: 101,
      format: 'hex',
      alpha: 1,
    });

    const getFrequencyIndex = (freq) => {
      for (let i = 0; i < freq.length; i++) {
        if (freq[i] >= centerFreq) return i;
      }
    }

    const uniqueDates = dataToRender.reduce((a,b) => {
      if (!a.map((d) => d.label).includes(b.Date)) {
        a.push({value: b.DateTimestamp, label: b.Date});
      }
      return a;
    }, []);

    const maxColor = uniqueDates[uniqueDates.length-1].value - uniqueDates[0].value;
    const colorMapper = (level) => uniqueDates.length == 1 ? colors[0] : colors[Math.floor((level-uniqueDates[0].value)/maxColor*100)];
    let graphSeries = [];
    for (const d in uniqueDates) {
      const allPSDs = dataToRender.filter((a) => a.Date == uniqueDates[d].label).map((a) => a.Power);
      const PSD = math.mean(math.matrix(allPSDs),0);
      const stdPSD = math.std(math.matrix(allPSDs),0);
      graphSeries.push({
        type: "line", x: dataToRender[0].Frequency, y: PSD._data, error_y: stdPSD._data.map((a) => a / math.sqrt(allPSDs.length)),
        line_options: {
          linewidth: 2,
          name: uniqueDates[d].label,
          legendgroup: uniqueDates[d].label,
          color: colorMapper(uniqueDates[d].value),
          hovertemplate: `  ${uniqueDates[d].label}<br>  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)}<extra></extra>`,
          showlegend: true
        }, 
        shade_options: {
          legendgroup: uniqueDates[d].label,
          color: colorMapper(uniqueDates[d].value),
          alpha: 0.3,
          showlegend: false
        }, 
        figName: figureTitle
      });

      const index = getFrequencyIndex(dataToRender[0].Frequency);
      graphSeries.push({
        type: "bar", x: [uniqueDates[d].label], y: [PSD._data[index]], 
        options: {
          error_y: {
            type: "data",
            array: [stdPSD._data[index]],
            visible: true
          },
          facecolor: colorMapper(uniqueDates[d].value),
          hovertemplate: `  %{y:.2f} <extra></extra>`,
          showlegend: false,
        },
        figName: figureTitle + "_Boxplot"
      })
    }

    setRenderData(graphSeries);    
  }, [figGroup, dataToRender, centerFreq]);

  const refreshRender = (fig, figName) => {
    for (let i in renderData) {
      if (renderData[i].figName == figName) {
        if (renderData[i].type === "line") {
          fig.shadedErrorBar(renderData[i].x, renderData[i].y, renderData[i].error_y, renderData[i].line_options, renderData[i].shade_options);
        } else if (renderData[i].type === "bar") {
          fig.bar(renderData[i].x, renderData[i].y, [], renderData[i].options);
          fig.setSubtitle("Spectral Features @ " + centerFreq.toFixed(1) + " Hz");
          //fig.box(renderData[i].x, renderData[i].y, renderData[i].options);
          //fig.setSubtitle("Spectral Features @ " + centerFreq.toFixed(1) + " Hz");
          //fig.setXlabel(renderData[i].parameter, {fontSize: 15});
          //fig.setYlim([0, math.max(renderData[i].y)*1.1]);
        }
      }
    }
    fig.render();
  }

  useEffect(() => {
    for (let key in figGroup) {
      const fig = figGroup[key];
      if (key.endsWith("Boxplot")) {
        fig.traces = [];
        refreshRender(fig, key);
      } else {
        fig.traces = [];
        refreshRender(fig, key);
      }
    }

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
  }, [figGroup, renderData]);

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
        setCenterFreq(data["points"][0]["x"]);
        plotly_singleclicked = false
      }, 300);
    }
  };

  return useMemo(() => (
    <Grid container spacing={0}>
      <Grid key={figureTitle} item xs={12} lg={6}>
        <MDBox ref={ref} id={figureTitle} style={{height: 600, width: "100%"}}/>
      </Grid>
      <Grid key={figureTitle + "_Boxplot"} item xs={12} lg={6}>
        <MDBox id={figureTitle + "_Boxplot"} style={{height: 600, width: "100%"}}/>
      </Grid>
    </Grid>
  ), [refresh]);
}

export default ChronicSnapshots;