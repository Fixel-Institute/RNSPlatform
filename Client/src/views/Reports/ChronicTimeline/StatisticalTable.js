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
import MDInput from "components/MDInput";

import colormap from "colormap";
import { TwitterPicker, BlockPicker } from "react-color";

import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";

import { dictionary, dictionaryLookup } from "assets/translation";
import { PlotlyRenderManager } from "graphing-utility/Plotly";
import { usePlatformContext } from "context";

const filter = createFilterOptions();

export default function StatisticalTable({data, availableChannels, annotations}) {
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;

  const chooseData = (data, annotation, channel) => {
    let filteredData = [];
    for (let i in data) {
      for (let j in data[i].ChannelNames) {
        if (data[i].ChannelNames[j] === channel) {
          filteredData.push(...data[i].Data[j].filter((a,k) => a && data[i].Time[k] > annotation.Date && data[i].Time[k] < annotation.Date + annotation.Duration));
        }
      }
    }
    return filteredData;
  }

  const calculateMean = (data) => {
    const result = {
      mean: Math.mean(data),
      std: Math.std(data),
    };
    return `${result.mean.toFixed(2)} ± ${result.std.toFixed(2)}`;
  }
  
  const statistics = {
    "Data Range": calculateMean
  }

  useEffect(() => {
    
  }, [annotations, availableChannels]);

  return (
      <MDBox px={2} pb={2} style={{overflowX: "auto", maxHeight: "100vh"}}>
        <Table size="large" style={{marginTop: 20, display: "block", height: "fit-content"}}>
          <TableHead sx={{display: "table-header-group", position: "sticky", top: 0, zIndex: 1}}>
            <TableRow sx={{background: "white"}}>
              <TableCell variant="head" style={{width: "15%", minWidth: 150, verticalAlign: "bottom", paddingBottom: 0, paddingTop: 0}}>
                <MDTypography variant="span" fontSize={12} fontWeight={"bold"} style={{cursor: "pointer"}} onClick={()=>{}}>
                  {"Event"}
                </MDTypography>
              </TableCell>
              <TableCell variant="head" style={{width: "15%", minWidth: 150, verticalAlign: "bottom", paddingBottom: 0, paddingTop: 0}}>
                <MDTypography variant="span" fontSize={12} fontWeight={"bold"} style={{cursor: "pointer"}} onClick={()=>{}}>
                  {"Channel"}
                </MDTypography>
              </TableCell>
              {Object.keys(statistics).map((statistic) => {
                return (
                  <TableCell variant="head" key={statistic} style={{width: "15%", minWidth: 150, verticalAlign: "bottom", paddingBottom: 0, paddingTop: 0}}>
                    <MDTypography variant="span" fontSize={12} fontWeight={"bold"} style={{cursor: "pointer"}} onClick={()=>{}}>
                      {statistic}
                    </MDTypography>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {annotations.map((annotation) => {
              return availableChannels.active.map((channel) => {
                const availableData = chooseData(data, annotation, channel);
                if (availableData.length == 0) return;

                return <TableRow key={annotation.Id + "_" + channel}>
                  <TableCell>
                    <MDTypography variant="span" fontSize={12} fontWeight={"bold"} onClick={()=>{}}>
                      {annotation.Name}
                    </MDTypography>
                  </TableCell>
                  <TableCell>
                    <MDTypography variant="span" fontSize={12} fontWeight={"bold"} onClick={()=>{}}>
                      {channel}
                    </MDTypography>
                  </TableCell>
                  {Object.keys(statistics).map((statistic) => {
                    const result = statistics[statistic](availableData);
                    return (
                      <TableCell key={statistic}>
                        <MDTypography variant="span" fontSize={12} fontWeight={"bold"}>
                          {result}
                        </MDTypography>
                      </TableCell>
                    );
                  })}
                </TableRow>;
              })
            })}
          </TableBody>
        </Table>
      </MDBox>
  );
}
