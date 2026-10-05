// SPDX-FileCopyrightText: 2024 Osnabrück University of Applied Sciences
// SPDX-FileContributor: Andreas Schliebitz
// SPDX-FileContributor: Henri Graf
// SPDX-FileContributor: Jonas Tüpker
// SPDX-FileContributor: Lukas Hesse
// SPDX-FileContributor: Maik Fruhner
// SPDX-FileContributor: Prof. Dr.-Ing. Heiko Tapken
// SPDX-FileContributor: Tobias Wamhof
//
// SPDX-License-Identifier: MIT

import React from 'react';

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

import { useNavigate } from 'react-router-dom';
import LogoutButton from './LogoutButton';
import HSOSLogo from './HSOSLogo';
import AgriGaiaLogo from './AgriGaiaLogo';

export default function MyAppBar({ toggleSideNav }: { toggleSideNav: () => void }) {
    const navigate = useNavigate();

    return (
        <Box sx={{ flexGrow: 1, display: 'flex' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <AgriGaiaLogo onClick={toggleSideNav} />
                    <Box sx={{ flexGrow: 1 }}>
                        <Button onClick={() => navigate('/')} color="inherit">
                            <Typography variant="h6" component="div" sx={{ textTransform: 'none' }}>
                                Agri-Gaia
                            </Typography>
                        </Button>
                    </Box>
                    <HSOSLogo />
                    <LogoutButton />
                </Toolbar>
            </AppBar>
        </Box>
    );
}
