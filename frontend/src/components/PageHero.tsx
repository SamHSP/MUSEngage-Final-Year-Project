import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { alpha, useTheme as useMuiTheme } from '@mui/material/styles';
import type { MouseEventHandler } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { heroThemes, type HeroThemeKey } from '../theme';
import { useTheme as useThemeMode } from '../context/ThemeContext';

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  theme?: HeroThemeKey;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
};

// Displays a themed hero section for top-level pages.
const PageHero = ({
  eyebrow,
  title,
  description,
  theme: heroTone = 'default',
  ctaLabel,
  ctaHref,
  onCtaClick,
}: PageHeroProps) => {
  const muiTheme = useMuiTheme();
  const { mode } = useThemeMode();
  const isDarkMode = mode === 'dark';
  const gradients = heroThemes(mode);
  const gradient = gradients[heroTone] ?? gradients.default;
  const isNeutralTheme = heroTone === 'neutral';
  const textColor = isNeutralTheme
    ? muiTheme.palette.text.primary
    : isDarkMode
      ? 'rgba(249, 250, 251, 0.96)'
      : muiTheme.palette.common.white;
  const eyebrowColor = isNeutralTheme
    ? muiTheme.palette.primary.main
    : isDarkMode
      ? 'rgba(255,255,255,0.72)'
      : 'rgba(255,255,255,0.76)';
  const descriptionColor = isNeutralTheme
    ? muiTheme.palette.text.secondary
    : isDarkMode
      ? 'rgba(255,255,255,0.85)'
      : 'rgba(255,255,255,0.9)';
  const isExternalLink = ctaHref ? /^(http|mailto)/.test(ctaHref) : false;
  const overlayGradient = isDarkMode
    ? 'linear-gradient(120deg, rgba(0,0,0,0.55), rgba(0,0,0,0.35))'
    : 'linear-gradient(120deg, rgba(0,0,0,0.35), rgba(0,0,0,0.2))';
  const accentOverlay = `radial-gradient(circle at 18% 20%, ${alpha(
    muiTheme.palette.aqua.light,
    isDarkMode ? 0.18 : 0.2,
  )}, transparent 55%),radial-gradient(circle at 82% 75%, ${alpha(
    muiTheme.palette.yellow.light,
    isDarkMode ? 0.16 : 0.165,
  )}, transparent 60%)`;

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        color: textColor,
        backgroundImage: gradient,
        backgroundColor: isNeutralTheme ? muiTheme.palette.background.default : undefined,
        py: { xs: 12, md: 16 },
        overflow: 'hidden',
        transition: 'background 0.5s ease, color 0.3s ease',
      }}
    >
      {!isNeutralTheme ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: overlayGradient,
          }}
        />
      ) : null}
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }} textAlign={{ xs: 'left', md: 'center' }}>
          {eyebrow ? (
            <Typography
              variant="h5"
              sx={{ letterSpacing: 4, textTransform: 'uppercase', color: eyebrowColor }}
            >
              {eyebrow}
            </Typography>
          ) : null}
          <Typography variant="h2" component="h1" color="inherit" sx={{ maxWidth: 800 }}>
            {title}
          </Typography>
          {description ? (
            <Typography variant="body1" sx={{ maxWidth: 720, color: descriptionColor }}>
              {description}
            </Typography>
          ) : null}
          {ctaLabel && ctaHref ? (
            <Button
              variant="contained"
              color="secondary"
              size="large"
              onClick={onCtaClick}
              {...(isExternalLink
                ? { href: ctaHref, target: '_blank', rel: 'noreferrer' }
                : { component: RouterLink, to: ctaHref })}
              sx={{
                alignSelf: { xs: 'stretch', md: 'center' },
                width: { xs: '100%', sm: 'auto' },
                boxShadow: isDarkMode
                  ? '0 16px 38px rgba(32, 228, 211, 0.35)'
                  : '0 16px 38px rgba(32, 228, 211, 0.25)',
              }}
            >
              {ctaLabel}
            </Button>
          ) : null}
        </Stack>
      </Container>
      {!isNeutralTheme ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: accentOverlay,
          }}
        />
      ) : null}
    </Box>
  );
};

export default PageHero;
