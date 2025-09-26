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

import { SessionController } from "database/session-control";
import { PlotlyRenderManager } from "graphing-utility/Plotly";
import { formatSegmentString, matchArray } from "database/helper-function";

import { usePlatformContext } from "context";
import { dictionary, dictionaryLookup } from "assets/translation";
import LoadingProgress from "components/LoadingProgress";
import MDTypography from "components/MDTypography";

function BurstDynamics({dataToRender, participant_uid, annotations, figureTitle}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  
  const [alert, setAlert] = useState(null);

  const [fig, setFig] = useState(null);
  const [renderData, setRenderData] = useState(null);
  const [cacheData, setCacheData] = useState(null);
  const [options, setOptions] = useState({type: "Channel", options: [], value: ""});
  const [burstParameters, setBurstParameters] = useState({});

  const [refresh, setRefresh] = useState(0);
  const [centerFreq, setCenterFreq] = useState(-1);

  useEffect(() => {
    setFig(new PlotlyRenderManager(figureTitle, language));
  }, [figureTitle]);

  useEffect(() => {
    let recordingIds = [];
    for (let i in dataToRender.Signal) {
      if (!recordingIds.includes(dataToRender.Signal[i].RecordingId)) {
        recordingIds.push(dataToRender.Signal[i].RecordingId);
      }
    }

    if (!options.value) return;
    
    setAlert(<LoadingProgress />);
    SessionController.query("/api/queryBurstAnalysis", {
      RequestType: "RequestData",
      ParticipantId: participant_uid,
      RecordingIds: recordingIds,
      Channel: options.value,
      CenterFrequency: centerFreq,
    }).then((response) => {
      if (response.data.length == 0) {
        SessionController.displayError("Async Processing Has Started. Check Schedules for Update.", setAlert);
        return;
      }

      setRenderData((graphingSeries) => {
        graphingSeries = graphingSeries.filter((a) => a.axName != "Burst");
        for (let n in response.data) {
          for (let i in response.data[n].Signal) {
            const timeArray = response.data[n].Signal[i].SignalSeries.BurstEnvelop.Wavelet.map((a,t) => new Date((response.data[n].Signal[i].SignalSeries.StartTime + t / response.data[n].Signal[i].SignalSeries.SamplingRate)*1000));
            graphingSeries.push({
              type: "line",
              x: timeArray, y: response.data[n].Signal[i].SignalSeries.BurstEnvelop.Wavelet,
              ylim: math.quantileSeq(math.abs(math.matrix(response.data[n].Signal[i].SignalSeries.BurstEnvelop.Wavelet)), 0.99),
              xlim: [timeArray[0],timeArray[timeArray.length-1]], 
              options: {
                name: "Burst Envelope",
                legendgroup: "Burst Envelope",
                linewidth: 0.5,
                hovertemplate: `  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "uV", language)}<extra></extra>`,
              }, 
              axName: "Burst"
            });

            setBurstParameters(response.data[n].Signal[i].SignalSeries.BurstEnvelop.Parameters);
            
            graphingSeries.push({
              type: "shading",
              x: timeArray, y: response.data[n].Signal[i].SignalSeries.BurstEnvelop.Wavelet, 
              threshold: response.data[n].Signal[i].SignalSeries.BurstEnvelop.Parameters.Threshold,
              options: {
                color: "#00AA00",
                alpha: 0.3,
                name: "Burst",
                legendgroup: "Burst Envelope",
                showlegend: false,
              },
              axName: "Burst"
            });
          }
        }
        return [...graphingSeries];
      });
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  }, [centerFreq])

  useEffect(() => {
    if (!fig) return;
  
    if (!fig.fresh) {
      fig.clearData();
    }
    
    const ax = fig.subplots(2, 1, {sharey: false, sharex: false});
    fig.setScaleType("log", "y", ax[0]);
    fig.setTickValue([0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000], "y", ax[0]);
    fig.setYlim([-3, 2], ax[0]);
    fig.setXlim([0, 100], ax[0]);
    fig.setXlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Frequency", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "Hertz", language)})`, {fontSize: 15}, ax[0]);
    fig.setYlabel(`${dictionaryLookup(dictionary.FigureStandardText, "Power", language)} (${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)})`, {fontSize: 15}, ax[0]);
    fig.setSubtitle("Select Frequency to View Burst Envelop", ax[0]);

    fig.setYlim([-50, 50], ax[1]);

    if (!fig.fresh) {
      refreshRender(fig);
    }

  }, [fig]);

  useEffect(() => {
    setOptions((options) => {
      options.options = [];
      if (options.type == "Channel") {
        for (let trial in dataToRender.Signal) {
          if (!options.options.includes(dataToRender.Signal[trial].SignalSeries.ChannelNames)) {
            options.options.push(dataToRender.Signal[trial].SignalSeries.ChannelNames);
          }
        }
      }
      return {options: [...options.options], value: options.options.length > 0 ? options.options[0] : "", type: options.type};
    });
  }, [options.type, dataToRender, annotations]);

  useEffect(() => {
    let cacheData = {};
    for (let trial in dataToRender.Signal) {
      if (!cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames]) {
        cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames] = {};
      }
      if (!cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames].Base) {
        cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames].Base = {freq: dataToRender.Signal[trial].SignalSeries.Spectrum.Frequency}
      }

      const selected_data = dataToRender.Signal[trial].SignalSeries.Spectrum.Power;
      if (!cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames].Base.power) {
        cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames].Base.power = math.matrix(selected_data);
      } else {
        cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames].Base.power = math.concat(cacheData[dataToRender.Signal[trial].SignalSeries.ChannelNames].Base.power, 
          selected_data, 1);
      }
    }
    setCacheData(cacheData);    
  }, [dataToRender]);

  useEffect(() => {
    const colors = colormap({
      colormap: 'rainbow',
      nshades: 101,
      format: 'hex',
      alpha: 1,
    });

    let graphSeries = [];
    if (options.type == "Channel") {
      for (let channel in cacheData) {
        if (channel == options.value) {
          let counter = 0;
          const colorMapper = (level) => colors[Math.floor(level/Object.keys(cacheData[channel]).length*100)];
          for (let annotation in cacheData[channel]) {
            if (cacheData[channel][annotation].power) {
              counter += 1;
              const ylim = math.quantileSeq(math.abs(math.matrix(cacheData[channel][annotation].power)), [0.25, 1]).map((a) => Math.round(Math.log10(a)));
              graphSeries.push({
                type: "line",
                x: cacheData[channel][annotation].freq, y: math.mean(cacheData[channel][annotation].power, 1)._data, error_y: math.std(cacheData[channel][annotation].power, 1)._data.map((a) => a/math.sqrt(cacheData[channel][annotation].power._size[1])),
                ylim: ylim,
                  line_options: {
                  name: annotation,
                  legendgroup: annotation,
                  color: colorMapper(counter),
                  linewidth: 2,
                  hovertemplate: `  ${annotation}<br>  %{y:.2f} ${dictionaryLookup(dictionary.FigureStandardUnit, "uV2Hz", language)}<extra></extra>`,
                  showlegend: true
                }, 
                shade_options: {
                  color: colorMapper(counter),
                  alpha: 0.3,
                  legendgroup: annotation,
                  showlegend: false
                },
                axName: "PSD"
              });
            }
          }
        }
      }
    }
    
    setRenderData(graphSeries);
  }, [fig, cacheData, options.value]);

  const refreshRender = (fig) => {
    const ax = fig.getAxes();
    for (let i in renderData) {
      if (renderData[i].type === "line") {
        if (renderData[i].axName == "Burst") {
          fig.setYlim([0, renderData[i].ylim], ax[1]);
          fig.plot(renderData[i].x, renderData[i].y, renderData[i].options, ax[1]);
        } else {
          fig.setYlim(renderData[i].ylim, ax[0]);
          fig.shadedErrorBar(renderData[i].x, renderData[i].y, renderData[i].error_y, renderData[i].line_options, renderData[i].shade_options, ax[0]);
        }
      } else if (renderData[i].type === "shading") {
        fig.addShading(renderData[i].x, renderData[i].y, renderData[i].threshold, renderData[i].options, ax[1]);
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
    if (data["points"][0].data.yaxis=="y") {
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
    }
  };

  return useMemo(() => (
    <Grid container spacing={0}>
        {alert}
      <Grid item xs={12}>
        <MDBox px={3} pt={3}>
          <Autocomplete
            value={options.value}
            options={options.options}
            onChange={(event, value) => setOptions({...options, value: value})}
            renderInput={(params) => (
              <FormField
                {...params}
                label={"Therapy Label Selector"}
                InputLabelProps={{ shrink: true }}
              />
            )}
            disableClearable
          />
        </MDBox>
      </Grid>
      <Grid key={figureTitle} item xs={12}>
        <MDBox ref={ref} id={figureTitle} style={{height: 800, width: "100%"}}/>
      </Grid>
      {burstParameters.Amplitude ? (
      <Grid key={"BurstParameters"} item xs={12}>
        <MDBox px={3}>
          <MDTypography variant="h6" fontWeight="bold">
            {"Center Burst Frequency: "}{(centerFreq).toFixed(2)}{" Hz"}
          </MDTypography>
          <MDTypography variant="h6" fontWeight="bold">
            {"Burst Amplitudes: "}{math.mean(burstParameters.Amplitude).toFixed(2)}{" ± "}{math.std(burstParameters.Amplitude).toFixed(2)}
          </MDTypography>
          <MDTypography variant="h6" fontWeight="bold">
            {"Max Burst Amplitude: "}{math.max(burstParameters.Amplitude).toFixed(2)}
          </MDTypography>
          <MDTypography variant="h6" fontWeight="bold">
            {"Burst Duration: "}{math.mean(burstParameters.Duration).toFixed(2)}{" ± "}{math.std(burstParameters.Duration).toFixed(2)}
          </MDTypography>
          <MDTypography variant="h6" fontWeight="bold">
            {"Max Burst Duration: "}{math.max(burstParameters.Duration).toFixed(2)}
          </MDTypography>
        </MDBox>
      </Grid>
      ) : null}
    </Grid>
  ), [alert, burstParameters, refresh]);
}

export default BurstDynamics;