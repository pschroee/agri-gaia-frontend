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
import { useParams } from 'react-router-dom';
import { httpGet } from '../api';
import useKeycloak from '../contexts/KeycloakContext';

import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';

import ContainerDeploymentList from '../components/edge/ContainerDeploymentList';
import EdgeDetailsGrid from '../components/edge/EdgeDetailsGrid';

import IEdgeDevice from '../types/IEdgeDevice';
import { EDGE_DEVICES_PATH } from '../endpoints';
import CircularProgress from '@mui/material/CircularProgress';
import { usePublishPageSelection } from '../agent/pageSelection';

export default function EdgeDetails() {
    const keycloak = useKeycloak();
    const edgeId = useParams().id;

    const [edgeDevice, setEdgeDevice] = useState<IEdgeDevice>();
    const [isLoading, setIsLoading] = useState(false);

    const fetchEdgeDevice = async (edgeId: string | undefined) => {
        setIsLoading(true);
        httpGet(keycloak, `${EDGE_DEVICES_PATH}/${edgeId}`)
            .then((data) => {
                setEdgeDevice(data);
            })
            .catch((error) => {
                console.error(error);
            })
            .finally(() => {
                setIsLoading(false);
            });
    };

    useEffect(() => {
        fetchEdgeDevice(edgeId);
    }, [keycloak]);

    // the opened edge device is the agent's page context (name once loaded)
    usePublishPageSelection(edgeDevice ? { kind: 'edge_device', id: edgeDevice.id, name: edgeDevice.name } : undefined);

    if (isLoading) {
        return (
            <span>
                <CircularProgress color="primary" />
                Fetching Device Details...
            </span>
        );
    }

    return edgeDevice ? (
        <>
            <Grid container spacing={4} justifyContent="space-between">
                <Grid item xs={12}>
                    <Typography variant="h4" component="h4">
                        Edge Device: {edgeDevice?.name ?? 'No Device Found'}
                    </Typography>
                </Grid>
                <Grid item xs={12}>
                    <Divider />
                </Grid>
                <Grid item xs={12}>
                    <Paper elevation={3} sx={{ p: 2 }}>
                        <Typography variant="h5" component="h5" sx={{ color: 'primary.dark' }}>
                            Device Info
                        </Typography>
                        <Box sx={{ py: 2 }}>
                            <EdgeDetailsGrid edgeDevice={edgeDevice} />
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12}>
                    <Paper elevation={3}>
                        <Typography variant="h5" component="h5" sx={{ color: 'primary.dark', p: 2 }}>
                            Container Deployments
                        </Typography>
                        <ContainerDeploymentList
                            containerDeployments={edgeDevice?.container_deployments}
                            refreshCallback={() => fetchEdgeDevice(edgeId)}
                        />
                    </Paper>
                </Grid>
            </Grid>
        </>
    ) : null;
}
