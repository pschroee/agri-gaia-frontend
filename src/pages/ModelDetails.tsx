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
import { Link as RouterLink, useParams } from 'react-router-dom';
import { httpGet } from '../api';
import useKeycloak from '../contexts/KeycloakContext';

import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';

import { MODELS_PATH } from '../endpoints';
import IModel from '../types/IModel';
import ModelDetailsGrid from '../components/models/ModelDetailsGrid';
import { usePublishPageSelection } from '../agent/pageSelection';
import { useReloadOnPlatformChange } from '../agent/platformChanges';

export default function ModelDetails() {
    const keycloak = useKeycloak();
    const modelId = useParams().id;

    const [model, setModel] = useState<IModel>();

    // set when the platform no longer knows the model (deleted, for example by the agent, #167)
    const [gone, setGone] = useState(false);

    const fetchModel = async (modelId: string | undefined) => {
        httpGet(keycloak, `${MODELS_PATH}/${modelId}`)
            .then((data) => {
                setModel(data);
                setGone(false);
            })
            .catch((error) => {
                if (error?.status === 404) {
                    setModel(undefined);
                    setGone(true);
                    return;
                }
                console.error(error);
            });
    };

    // the agent changed a model: load this one again; the page stays as it is, there is no loading state (#167)
    useReloadOnPlatformChange('models', () => fetchModel(modelId));

    const updateModel = (model: IModel) => {
        setModel(model);
    };

    useEffect(() => {
        fetchModel(modelId);
    }, [keycloak]);

    // the opened model is the agent's page context (name once loaded)
    usePublishPageSelection(model ? { kind: 'model', id: model.id, name: model.name } : undefined);

    if (gone) {
        return (
            <Alert severity="info">
                This model no longer exists. It may have been deleted.{' '}
                <Link component={RouterLink} to="/models">
                    Back to models
                </Link>
            </Alert>
        );
    }

    return model ? (
        <>
            <Grid container spacing={4} justifyContent="space-between">
                <Grid item xs={12}>
                    <Typography variant="h4" component="h4">
                        Model: {model?.name ?? 'No Device Found'}
                    </Typography>
                </Grid>
                <Grid item xs={12}>
                    <Divider />
                </Grid>
                <Grid item xs={12}>
                    <Paper elevation={3} sx={{ p: 2 }}>
                        <ModelDetailsGrid model={model} onEditSuccessful={updateModel} />
                    </Paper>
                </Grid>
            </Grid>
        </>
    ) : null;
}
