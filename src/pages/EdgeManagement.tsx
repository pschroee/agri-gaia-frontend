// SPDX-FileCopyrightText: 2024 Osnabrück University of Applied Sciences
// SPDX-FileContributor: Andreas Schliebitz
// SPDX-FileContributor: Henri Graf
// SPDX-FileContributor: Jonas Tüpker
// SPDX-FileContributor: Lukas Hesse
// SPDX-FileContributor: Maik Fruhner
// SPDX-FileContributor: Prof. Dr.-Ing. Heiko Tapken
// SPDX-FileContributor: Tobias Wamhof
// SPDX-FileContributor: Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';
import { httpGet } from '../api';
import useKeycloak from '../contexts/KeycloakContext';

import AddIcon from '@mui/icons-material/Add';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Fab from '@mui/material/Fab';

import AddEdgeDeviceDialog from '../components/edge/AddEdgeDeviceDialog';
import EdgeDeviceList from '../components/edge/List';

import IEdgeDevice from '../types/IEdgeDevice';
import { useReloadOnPlatformChange } from '../agent/platformChanges';
import { EDGE_DEVICES_PATH, TAGS_PATH } from '../endpoints';
import NoDataYet from '../components/common/NoDataYet';
import CircularProgress from '@mui/material/CircularProgress';
import ITag from '../types/ITag';

export default function EdgeManagement() {
    const keycloak = useKeycloak();

    const [edgeDevices, setEdgeDevices] = useState<Array<IEdgeDevice>>([]);
    const [tags, setTags] = useState<Array<ITag>>([]);
    const [addEdgeDeviceDialogOpen, setAddEdgeDeviceDialogOpen] = useState(false);
    const [edgeDevicesAreLoading, setEdgeDevicesAreLoading] = useState(false);
    const [initialLoadCompleted, setInitialLoadCompleted] = useState(false);

    const fetchEdgeDevices = async () => {
        setEdgeDevicesAreLoading(true);
        httpGet(keycloak, EDGE_DEVICES_PATH)
            .then((devices: IEdgeDevice[]) => {
                devices.sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
                setEdgeDevices(devices);
            })
            .catch((error) => {
                console.error(error);
            })
            .finally(() => {
                setEdgeDevicesAreLoading(false);
                setInitialLoadCompleted(true);
            });
    };

    // the agent changed an edge device: show the new list without leaving the page (the 5 s interval stays)
    useReloadOnPlatformChange('edge-devices', fetchEdgeDevices);

    const fetchTags = async () => {
        httpGet(keycloak, TAGS_PATH)
            .then((data) => {
                setTags(data);
            })
            .catch((error) => {
                console.error(error);
            });
    };

    useEffect(() => {
        fetchEdgeDevices();
        fetchTags();

        // create an interval to fetch edge device updates every x seconds
        const edgeDeviceFetchInterval = setInterval(fetchEdgeDevices, 5000);
        console.log('Starting Edge Device Fetch Interval');

        return () => {
            clearInterval(edgeDeviceFetchInterval);
            console.log('Stopping Edge Device Fetch Interval');
        };
    }, [keycloak]);

    const handleAddEdgeDeviceDialogOpen = () => {
        setAddEdgeDeviceDialogOpen(true);
    };

    const handleAddEdgeDeviceDialogClose = () => {
        setAddEdgeDeviceDialogOpen(false);
        fetchEdgeDevices();
        fetchTags();
    };

    return (
        <>
            {addEdgeDeviceDialogOpen ? (
                <AddEdgeDeviceDialog tags={tags} handleClose={handleAddEdgeDeviceDialogClose} />
            ) : null}
            <Grid container spacing={2} justifyContent="space-between">
                <Grid item xs={6}>
                    <Typography variant="h4" component="h4">
                        Edge Devices
                    </Typography>
                </Grid>
                <Grid item xs={1}>
                    <Fab
                        color="primary"
                        aria-label="add"
                        size="small"
                        sx={{ float: 'right' }}
                        onClick={handleAddEdgeDeviceDialogOpen}
                    >
                        <AddIcon />
                    </Fab>
                </Grid>
            </Grid>

            {edgeDevicesAreLoading && !initialLoadCompleted ? (
                <Grid container justifyContent="center">
                    <Grid item xs={1}>
                        <CircularProgress color="primary" />
                    </Grid>
                </Grid>
            ) : (
                <>
                    <EdgeDeviceList edgeDevices={edgeDevices} refreshCallback={fetchEdgeDevices} />
                    <NoDataYet data={edgeDevices} name="Edge Devices" />
                </>
            )}
        </>
    );
}
