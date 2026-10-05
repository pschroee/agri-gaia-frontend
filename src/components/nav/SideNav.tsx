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

import { ReactNode, useContext, useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Toolbar from '@mui/material/Toolbar';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';
import SettingsIcon from '@mui/icons-material/Settings';
import BugReportIcon from '@mui/icons-material/BugReport';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import SsidChartIcon from '@mui/icons-material/SsidChart';
import PhonelinkOutlinedIcon from '@mui/icons-material/PhonelinkOutlined';
import WorkspacesOutlinedIcon from '@mui/icons-material/WorkspacesOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import AppRegistrationOutlinedIcon from '@mui/icons-material/AppRegistrationOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import HubIcon from '@mui/icons-material/Hub';
import TranslateIcon from '@mui/icons-material/Translate';
import StorageIcon from '@mui/icons-material/Storage';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import BuildIcon from '@mui/icons-material/Build';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import StackedBarChartIcon from '@mui/icons-material/StackedBarChart';
import StoreIcon from '@mui/icons-material/Store';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import PeopleIcon from '@mui/icons-material/People';
import SpeedIcon from '@mui/icons-material/Speed';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { useNavigate } from 'react-router-dom';
import { createSubdomainUrl, openInNewTab } from '../../util';
import { SideNavClosedWidth, SideNavOpenWidth, SideNavWidthContext } from '../../contexts/SideNavWidthContext';
import { httpGet } from '../../api';
import { URLS_BASIC_AUTH_PATH } from '../../endpoints';
import useKeycloak from '../../contexts/KeycloakContext';
import { agentEnabled } from '../../agent/api';
import { AGENT_ROUTE } from '../../agent/components/AgentLayer';

interface IListItem {
    text: string;
    link: string;
    icon: ReactNode;
    external?: boolean;
    disabled?: boolean;
    accent?: boolean;
}

export default function SideNav() {
    const navigate = useNavigate();
    const isOpen = useContext(SideNavWidthContext).isOpen;
    const keycloak = useKeycloak();

    const [activeItemLink, setActiveItemLink] = useState<string | undefined>(undefined);
    const [fusekiBasicAuthUrl, setFusekiBasicAuthUrl] = useState<string>(createSubdomainUrl('fuseki'));

    useEffect(() => {
        // Find SideNav item matching current location's pathname and set its link as the currently active one.
        setActiveItemLink(
            [...agentLinks, ...internalLinks].find((item: IListItem) => item.link === window.location.pathname)?.link,
        );
        fetchFusekiBasicAuthUrl();
    }, [window.location.pathname, keycloak]);

    const fetchFusekiBasicAuthUrl = async () => {
        httpGet(keycloak, `${URLS_BASIC_AUTH_PATH}/fuseki`)
            .then(({ url }) => setFusekiBasicAuthUrl(url))
            .catch((error) => console.error(error));
    };

    // Entry of the AI agent, on top and in the primary colour like in the design prototype.
    const agentLinks: Array<IListItem> = agentEnabled
        ? [{ text: 'Agent', link: AGENT_ROUTE, icon: <AutoAwesomeIcon />, accent: true }]
        : [];

    const internalLinks: Array<IListItem> = [
        {
            text: 'Datasets',
            link: '/data',
            icon: <InsertDriveFileOutlinedIcon />,
        },
        {
            text: 'Model Training',
            link: '/train',
            icon: <FitnessCenterIcon />,
        },
        {
            text: 'Models',
            link: '/models',
            icon: <AppRegistrationOutlinedIcon />,
        },
        {
            text: 'Container Templates',
            link: '/inference-container-templates',
            icon: <BuildIcon />,
        },
        {
            text: 'Container Registry',
            link: '/container-images',
            icon: <Inventory2Icon />,
        },
        {
            text: 'Edge Devices',
            link: '/edge',
            icon: <PhonelinkOutlinedIcon />,
        },
        {
            text: 'Edge Groups',
            link: '/edge-groups',
            icon: <GroupWorkIcon />,
        },
        {
            text: 'Applications',
            link: '/applications',
            icon: <WorkspacesOutlinedIcon />,
        },
        // {
        //     text: 'Open Data',
        //     link: '/open-data',
        //     icon: <StackedBarChartIcon />,
        // },
        {
            text: 'Notebooks',
            link: createSubdomainUrl('jupyterhub'),
            external: true,
            icon: <SettingsIcon />,
        },
        {
            text: 'Integrated Services',
            link: '/integrated-services',
            icon: <ApiOutlinedIcon />,
        },
        {
            text: 'Network',
            link: '/network',
            icon: <PeopleIcon />,
        },
    ];

    const externalLinks: Array<IListItem> = [
        {
            text: 'Object Store',
            link: createSubdomainUrl('minio'),
            external: true,
            icon: <StorageIcon />,
        },
        {
            text: 'Triple Store',
            link: fusekiBasicAuthUrl,
            external: true,
            icon: <HubIcon />,
        },
        {
            text: 'Ontologies',
            link: createSubdomainUrl('webvowl'),
            external: true,
            icon: <TranslateIcon />,
        },
        {
            text: 'Portainer',
            link: createSubdomainUrl('portainer'),
            external: true,
            icon: <PhonelinkOutlinedIcon />,
        },
        {
            text: 'Monitoring',
            link: `${createSubdomainUrl('monitoring')}/dashboards`,
            external: true,
            icon: <SsidChartIcon />,
        },
        {
            text: 'Bug Report',
            link: `
            mailto:agri-gaia-support@hs-osnabrueck.de?subject=Bug%20Report%3A%20%3CShort%20bug%20description%3E&body=%3D%3D%3D%20Describe%20the%20bug%20%3D%3D%3D%0A%0AA%20clear%20and%20concise%20description%20of%20what%20the%20bug%20is%20and%20where%20it%20is%20located%20(full%20URLs%2C%20API%20endpoints%2C%20etc.).%0A%0A%3D%3D%3D%20Steps%20to%20reproduce%20%3D%3D%3D%0A%0AA%20list%20of%20steps%20allowing%20someone%20else%20to%20reproduce%20the%20bug.%0A%0A%20%3D%3D%3D%20Expected%20behavior%20%3D%3D%3D%0A%0AA%20clear%20and%20concise%20description%20of%20what%20you%20expected%20to%20happen.%0A%0A%3D%3D%3D%20Priority%20%3D%3D%3D%0A%0AWhat%20is%20the%20impact%20of%20this%20bug%20on%20the%20user%2C%20how%20critical%20is%20to%20fix%3F%20P0%2C%20P1%2C%20...%2C%20P4%0A(For%20reference%20see%3A%20https%3A%2F%2Fdevelopers.google.com%2Fissue-tracker%2Fconcepts%2Fissues%3Fhl%3Den%23priority)%0A%0A%3D%3D%3D%20Screenshots%2FVideo%20%3D%3D%3D%0A%0AIf%20applicable%2C%20add%20screenshots%2Fvideo%20to%20help%20explain%20your%20problem.%20Remember%20to%20mark%20the%20area%20in%20the%20application%20that's%20impacted.%0A%0A%3D%3D%3D%20Desktop%20%3D%3D%3D%0A%0A*%20OS%3A%20%5Be.g.%20iOS%5D%0A*%20Browser%20%5Be.g.%20chrome%2C%20safari%2C%20firefox%2C%20edge%5D%0A*%20Resolution%20%5Be.g.%202560x1289%5D%0A*%20Version%20%5Be.g.%2022%5D%0A%0A%3D%3D%3D%20Mobile%2FTablet%20%3D%3D%3D%0A%0A*%20Device%3A%20%5Be.g.%20iPhone6%5D%0A*%20OS%3A%20%5Be.g.%20iOS8.1%5D%0A*%20Screen%20size%3A%20%5Be.g.%204.75%2C%205.5%5D%0A*%20Mobile%20Browser%20%5Be.g.%20stock%20browser%2C%20safari%5D%0A*%20Version%20%5Be.g.%2022%5D%0A%0A%3D%3D%3D%20Additional%20context%20%3D%3D%3D%0A%0AAdd%20any%20other%20context%20about%20the%20problem%20here.`,
            external: true,
            icon: <BugReportIcon />,
        },
        /*
        {
            text: 'EDC Debug',
            link: '/edc-debug',
            icon: <ForumOutlinedIcon />,
        },
        {
            text: 'Docker',
            link: '/docker',
            icon: <SettingsIcon />,
        },
        {
            text: 'Settings',
            link: '/settings',
            icon: <SettingsIcon />,
            disabled: true,
        },
        */
    ];

    function handleLinkOnClick(item: IListItem) {
        if (item.external) {
            openInNewTab(item.link);
        } else {
            navigate(item.link);
        }
    }

    function renderListItem(item: IListItem) {
        const { text, disabled, icon, external, accent } = item;
        const isActive = item.link === activeItemLink;
        const backgroundColor = isActive ? 'rgba(0,0,0,0.07)' : undefined;
        return (
            <ListItemButton
                disabled={disabled}
                key={item.link}
                onClick={() => handleLinkOnClick(item)}
                style={{ backgroundColor, borderRadius: '10px' }}
            >
                <ListItemIcon
                    sx={{ marginTop: '4px', marginBottom: '4px', color: accent ? 'primary.main' : undefined }}
                >
                    {icon ? icon : <QuestionMarkIcon />}
                </ListItemIcon>

                <ListItemText
                    primary={isOpen ? text : ' '}
                    primaryTypographyProps={accent ? { color: 'primary', fontWeight: 500 } : undefined}
                />
                {external && isOpen && (
                    <ListItemIcon>
                        <OpenInNewOutlinedIcon />
                    </ListItemIcon>
                )}
            </ListItemButton>
        );
    }

    const width = isOpen ? SideNavOpenWidth : SideNavClosedWidth;

    return (
        <Drawer
            variant="permanent"
            open={isOpen}
            sx={{
                width,
                [`& .MuiDrawer-paper`]: { width, boxSizing: 'border-box' },
            }}
        >
            <Toolbar />
            <Box sx={{ padding: '5px' }} mb={4}>
                {agentLinks.length > 0 && (
                    <>
                        <List>{agentLinks.map((item) => renderListItem(item))}</List>
                        <Divider />
                    </>
                )}
                <List>{internalLinks.map((item) => renderListItem(item))}</List>
                <Divider />
                <List>{externalLinks.map((item) => renderListItem(item))}</List>
            </Box>
        </Drawer>
    );
}
