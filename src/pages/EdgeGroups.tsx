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

import AddEdgeGroupDialog from '../components/edge-groups/AddEdgeGroupDialog';
import EdgeGroupList from '../components/edge-groups/List';

import IEdgeGroup from '../types/IEdgeGroup';
import { useReloadOnPlatformChange } from '../agent/platformChanges';
import { EDGE_GROUPS_PATH, TAGS_PATH } from '../endpoints';
import NoDataYet from '../components/common/NoDataYet';
import CircularProgress from '@mui/material/CircularProgress';
import ITag from '../types/ITag';

export default function EdgeGroups() {
    const keycloak = useKeycloak();

    const [edgeGroups, setEdgeGroups] = useState<Array<IEdgeGroup>>([]);
    const [tags, setTags] = useState<Array<ITag>>([]);
    const [addEdgeGroupDialogOpen, setAddEdgeGroupDialogOpen] = useState(false);
    const [edgeGroupsAreLoading, setEdgeGroupsAreLoading] = useState(false);

    const fetchEdgeGroups = async () => {
        setEdgeGroupsAreLoading(true);
        httpGet(keycloak, EDGE_GROUPS_PATH)
            .then((data) => {
                console.log(data);
                setEdgeGroups(data);
            })
            .catch((error) => {
                console.error(error);
            })
            .finally(() => setEdgeGroupsAreLoading(false));
    };

    // the agent changed an edge group: show the new list without leaving the page
    useReloadOnPlatformChange('edge-groups', fetchEdgeGroups);

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
        fetchEdgeGroups();
        fetchTags();
    }, [keycloak]);

    const handleAddEdgeGroupDialogOpen = () => {
        setAddEdgeGroupDialogOpen(true);
    };

    const handleAddEdgeGroupDialogClose = () => {
        setAddEdgeGroupDialogOpen(false);
        fetchEdgeGroups();
        fetchTags();
    };

    return (
        <>
            {addEdgeGroupDialogOpen ? (
                <AddEdgeGroupDialog tags={tags} handleClose={handleAddEdgeGroupDialogClose} />
            ) : null}
            <Grid container spacing={2} justifyContent="space-between">
                <Grid item xs={6}>
                    <Typography variant="h4" component="h4">
                        Edge Groups
                    </Typography>
                </Grid>
                <Grid item xs={1}>
                    <Fab
                        color="primary"
                        aria-label="add"
                        size="small"
                        sx={{ float: 'right' }}
                        onClick={handleAddEdgeGroupDialogOpen}
                    >
                        <AddIcon />
                    </Fab>
                </Grid>
            </Grid>

            {edgeGroupsAreLoading ? (
                <Grid container justifyContent="center">
                    <Grid item xs={1}>
                        <CircularProgress color="primary" />
                    </Grid>
                </Grid>
            ) : (
                <>
                    <EdgeGroupList
                        edgeGroups={edgeGroups}
                        tags={tags}
                        refreshCallback={() => {
                            fetchEdgeGroups();
                            fetchTags();
                        }}
                    />
                    <NoDataYet data={edgeGroups} name="Edge Groups" />
                </>
            )}
        </>
    );
}
