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

import React, { useEffect, useState } from 'react';
import AppBar from '../nav/AppBar';

import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';

import Footer from '../Footer';
import SideNav from '../nav/SideNav';

import useKeycloak from '../../contexts/KeycloakContext';
import { httpGet } from '../../api';
import { USERS_PING } from '../../endpoints';
import { SideNavWidthContext, SideNavClosedWidth, SideNavOpenWidth } from '../../contexts/SideNavWidthContext';
import AgentPanel, {
    AgentPanelWidth,
    agentEnabled,
    loadAgentPanelOpen,
    storeAgentPanelOpen,
} from '../agent/AgentPanel';
interface IPageContainerProps {
    children?: React.ReactNode;
    maxWidth?: string;
}

export default function PageContainer(props: IPageContainerProps) {
    const keycloak = useKeycloak();

    const [sideNavOpen, setSideNavOpen] = useState(true);
    const [sideNavWidth, setSideNavWidth] = useState(SideNavOpenWidth);
    const [agentPanelOpen, setAgentPanelOpen] = useState(() => agentEnabled && loadAgentPanelOpen());

    const toggleAgentPanel = () => {
        storeAgentPanelOpen(!agentPanelOpen);
        setAgentPanelOpen(!agentPanelOpen);
    };

    const toggleSideNavState = () => {
        if (sideNavOpen) {
            setSideNavOpen(false);
            setSideNavWidth(SideNavClosedWidth);
        } else {
            setSideNavOpen(true);
            setSideNavWidth(SideNavOpenWidth);
        }
    };

    const fetchUser = async () => {
        httpGet(keycloak, USERS_PING);
    };

    useEffect(() => {
        // create an interval to fetch the user every minute
        // so the page gets redirected to login, once the token expired
        const userFetchInterval = setInterval(fetchUser, 60000);
        console.log('Starting User Fetch Interval');

        return () => {
            clearInterval(userFetchInterval);
            console.log('Stopping User Fetch Interval');
        };
    }, [keycloak]);

    return (
        <>
            {keycloak?.authenticated ? (
                <>
                    <SideNavWidthContext.Provider value={{ isOpen: sideNavOpen, width: sideNavWidth }}>
                        <AppBar
                            toggleSideNav={toggleSideNavState}
                            toggleAgentPanel={agentEnabled ? toggleAgentPanel : undefined}
                        />
                        <SideNav />
                        <Box
                            component="main"
                            sx={{
                                height: '100%',
                                flexGrow: 1,
                                p: 3,
                                ml: `${sideNavWidth}px`,
                                mr: agentPanelOpen ? `${AgentPanelWidth}px` : 0,
                            }}
                        >
                            <Toolbar />
                            {props.children}
                        </Box>
                        {agentEnabled && (
                            <AgentPanel open={agentPanelOpen} onClose={() => toggleAgentPanel()} />
                        )}
                        <Footer />
                    </SideNavWidthContext.Provider>
                </>
            ) : null}
        </>
    );
}
