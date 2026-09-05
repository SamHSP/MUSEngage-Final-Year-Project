import { useEffect, useMemo, useState } from 'react';
import axios, { isAxiosError } from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  type AlertColor,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Helmet } from 'react-helmet-async';

const API = import.meta.env.VITE_BACKEND_API;
const API_BASE = typeof API === 'string' ? API.trim().replace(/\/+$/, '') : '';
// Prefixes API routes with the configured backend base URL.
const apiPath = (path: string) => `${API_BASE}${path}`;

const SHIPPING_ADDRESS_STORAGE_KEY = 'muse.shop.shippingAddress';
const RECEIPT_EMAIL_STORAGE_KEY = 'muse.shop.receiptEmail';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ItemApi = {
  id: unknown;
  name: unknown;
  description?: unknown;
  availabilityCount?: unknown;
  price?: unknown;
  url?: unknown;
};

type ItemRecord = {
  id: string;
  name: string;
  description: string;
  availabilityCount: number;
  price: number;
  url: string | null;
};

type CartItemRecord = ItemRecord & { quantity: number };

type CartNotice = {
  severity: AlertColor;
  message: string;
};

// Safely converts unknown numeric values into non-negative integers.
function toNonNegativeInt(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || Number.isNaN(numericValue)) {
    return 0;
  }
  return Math.max(0, Math.round(numericValue));
}

function generateFallbackId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

// Normalises the backend representation of an item to the UI-friendly shape.
function mapItem(api: ItemApi): ItemRecord {
  const id = typeof api.id === 'string' && api.id.trim() ? api.id : generateFallbackId();
  return {
    id,
    name: typeof api.name === 'string' && api.name.trim() ? api.name : 'Unnamed item',
    description: typeof api.description === 'string' ? api.description : '',
    availabilityCount: toNonNegativeInt(api.availabilityCount),
    price: toNonNegativeInt(api.price),
    url: typeof api.url === 'string' && api.url.trim() ? api.url : null,
  };
}

// Formats prices stored in cents into readable currency strings.
function formatPrice(priceInCents: number) {
  if (!Number.isFinite(priceInCents)) {
    return '—';
  }
  if (priceInCents === 0) {
    return 'Free';
  }
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
  }).format(priceInCents / 100);
}

// Displays the merchandise catalogue along with a simple cart workflow.
const ShopPage = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, CartItemRecord>>({});
  const [cartNotice, setCartNotice] = useState<CartNotice | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingAddressError, setShippingAddressError] = useState<string | null>(null);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptEmailError, setReceiptEmailError] = useState<string | null>(null);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartItemCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems],
  );
  const cartSubtotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.price * item.quantity, 0),
    [cartItems],
  );
  const cartIsEmpty = cartItems.length === 0;

  // Clears any cart-level notification banner.
  const clearCartNotice = () => setCartNotice(null);

  // Adds an item to the cart, respecting stock limits.
  const handleAddToCart = (item: ItemRecord) => {
    if (item.availabilityCount <= 0) {
      setCartNotice({ severity: 'warning', message: 'This item is out of stock.' });
      return;
    }
    setCheckoutError(null);
    let didUpdate = false;
    setCart((prev) => {
      const existing = prev[item.id];
      const nextQuantity = Math.min((existing?.quantity ?? 0) + 1, item.availabilityCount);
      if (existing && nextQuantity === existing.quantity) {
        return prev;
      }
      didUpdate = true;
      return {
        ...prev,
        [item.id]: {
          ...item,
          quantity: nextQuantity,
        },
      };
    });
    setCartNotice(
      didUpdate
        ? { severity: 'success', message: `${item.name} added to your cart.` }
        : {
            severity: 'warning',
            message: `Only ${item.availabilityCount} item${item.availabilityCount === 1 ? '' : 's'} available.`,
          },
    );
  };

  // Increases the quantity of a cart item by one.
  const handleIncreaseQuantity = (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    if (item.availabilityCount <= 0) {
      setCartNotice({ severity: 'warning', message: 'This item is out of stock.' });
      return;
    }
    setCheckoutError(null);
    let newQuantity: number | null = null;
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) {
        return prev;
      }
      const nextQuantity = Math.min(existing.quantity + 1, item.availabilityCount);
      if (nextQuantity === existing.quantity) {
        return prev;
      }
      newQuantity = nextQuantity;
      return {
        ...prev,
        [itemId]: {
          ...existing,
          quantity: nextQuantity,
        },
      };
    });
    if (newQuantity !== null) {
      setCartNotice({ severity: 'info', message: `Updated ${item.name} quantity to ${newQuantity}.` });
    } else {
      setCartNotice({
        severity: 'warning',
        message: `Only ${item.availabilityCount} item${item.availabilityCount === 1 ? '' : 's'} available.`,
      });
    }
  };

  // Decreases the quantity of a cart item, removing it when zero.
  const handleDecreaseQuantity = (itemId: string) => {
    setCheckoutError(null);
    let removedItemName: string | null = null;
    let newQuantity: number | null = null;
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) {
        return prev;
      }
      const nextQuantity = existing.quantity - 1;
      if (nextQuantity <= 0) {
        removedItemName = existing.name;
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      newQuantity = nextQuantity;
      return {
        ...prev,
        [itemId]: {
          ...existing,
          quantity: nextQuantity,
        },
      };
    });
    if (removedItemName) {
      setCartNotice({ severity: 'info', message: `Removed ${removedItemName} from your cart.` });
    } else if (newQuantity !== null) {
      const item = items.find((entry) => entry.id === itemId);
      const itemName = item?.name ?? 'Item';
      setCartNotice({ severity: 'info', message: `Updated ${itemName} quantity to ${newQuantity}.` });
    }
  };

  // Removes an item entirely from the cart.
  const handleRemoveFromCart = (itemId: string) => {
    setCheckoutError(null);
    let removedItemName: string | null = null;
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) {
        return prev;
      }
      removedItemName = existing.name;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    if (removedItemName) {
      setCartNotice({ severity: 'info', message: `${removedItemName} removed from your cart.` });
    }
  };

  // Opens the checkout confirmation dialog when online.
  const handleOpenCheckout = () => {
    if (!isOnline) {
      setCartNotice({
        severity: 'warning',
        message: 'Checkout requires an internet connection. Please reconnect to continue.',
      });
      return;
    }
    setCheckoutError(null);
    setShippingAddressError(null);
    setReceiptEmailError(null);
    clearCartNotice();
    setConfirmOpen(true);
  };

  // Initiates the checkout session with the backend.
  const handleConfirmCheckout = async () => {
    if (cartIsEmpty) {
      setCheckoutError('Your cart is empty.');
      setConfirmOpen(false);
      return;
    }
    if (!isOnline) {
      setCheckoutError('You are offline. Reconnect to continue to checkout.');
      setConfirmOpen(false);
      return;
    }
    const trimmedEmail = receiptEmail.trim();
    if (!trimmedEmail) {
      setReceiptEmailError('Please provide an email address for your receipt.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setReceiptEmailError('Please provide a valid email address.');
      return;
    }
    const trimmedAddress = shippingAddress.trim();
    if (trimmedAddress.length < 10) {
      setShippingAddressError('Please provide your full shipping address, including postal code.');
      return;
    }
    try {
      setCheckoutLoading(true);
      const payload = {
        customer_email: trimmedEmail,
        shipping_address: trimmedAddress,
        items: cartItems.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      };
      const { data } = await axios.post<{ url: string }>(apiPath('/api/checkout/session'), payload);
      if (!data?.url) {
        throw new Error('Checkout session did not return a redirect URL.');
      }
      window.location.href = data.url;
    } catch (err) {
      console.error('Failed to start checkout session', err);
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string' && detail.trim()) {
          setCheckoutError(detail.trim());
        } else {
          setCheckoutError('Unable to start checkout. Please try again.');
        }
      } else {
        setCheckoutError('Unable to start checkout. Please try again.');
      }
      setConfirmOpen(false);
    } finally {
      setCheckoutLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(SHIPPING_ADDRESS_STORAGE_KEY);
    if (stored) {
      setShippingAddress(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const trimmed = shippingAddress.trim();
    if (trimmed) {
      window.localStorage.setItem(SHIPPING_ADDRESS_STORAGE_KEY, shippingAddress);
    } else {
      window.localStorage.removeItem(SHIPPING_ADDRESS_STORAGE_KEY);
    }
  }, [shippingAddress]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(RECEIPT_EMAIL_STORAGE_KEY);
    if (stored) {
      setReceiptEmail(stored);
    }
  }, []);

  useEffect(() => {
    if (!user?.email) {
      return;
    }
    setReceiptEmail((previous) => {
      if (previous.trim()) {
        return previous;
      }
      return user.email;
    });
  }, [user?.email]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const trimmed = receiptEmail.trim();
    if (trimmed) {
      window.localStorage.setItem(RECEIPT_EMAIL_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(RECEIPT_EMAIL_STORAGE_KEY);
    }
  }, [receiptEmail]);

  useEffect(() => {
    let cancelled = false;

    // Retrieves the latest merchandise catalogue.
    async function loadItems() {
      setLoading(true);
      try {
        const { data } = await axios.get<ItemApi[] | unknown>(apiPath('/api/items'));
        if (cancelled) {
          return;
        }

        if (!Array.isArray(data)) {
          throw new Error('Received an unexpected catalogue response.');
        }

        setItems(data.map(mapItem));
        setError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load catalogue', err);
        setError('Unable to load catalogue. Please try again later.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Helmet>
        <title>MUSEngage | Merchandise shop</title>
        <meta
          name="description"
          content="Browse official Murdoch University merchandise and redeem rewards from the student shop."
        />
      </Helmet>
      <Box>
        <PageHero
        eyebrow="Murdoch University"
        title="Murdoch Merchandise"
        description="Discover official merchandise curated for the Murdoch community."
        theme="shop"
      />

      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Stack spacing={3}>
          <Stack spacing={1} maxWidth={560}>
            <Typography variant="h4" component="h2">Shop catalogue</Typography>
            <Typography variant="body1" color="text.secondary">
              Redeem with reward points or purchase directly on campus.
            </Typography>
          </Stack>

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2.5, md: 3 },
              borderRadius: 3,
              backgroundColor: 'background.paper',
            }}
          >
            <Stack spacing={2.5}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Stack spacing={0.5}>
                  <Typography variant="h6" component="h3">Your cart</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {cartIsEmpty
                      ? 'Your cart is empty. Add merchandise below to begin checkout.'
                      : 'Review your selected merchandise before heading to checkout.'}
                  </Typography>
                </Stack>
                <Chip
                  label={`${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
                  color="secondary"
                  variant="outlined"
                />
              </Stack>

              <Stack spacing={1.5}>
                <Collapse in={Boolean(cartNotice)} unmountOnExit>
                  {cartNotice ? (
                    <Alert severity={cartNotice.severity} onClose={clearCartNotice}>
                      {cartNotice.message}
                    </Alert>
                  ) : null}
                </Collapse>
                <Collapse in={Boolean(checkoutError)} unmountOnExit>
                  {checkoutError ? (
                    <Alert severity="error" onClose={() => setCheckoutError(null)}>
                      {checkoutError}
                    </Alert>
                  ) : null}
                </Collapse>
              </Stack>

              {cartIsEmpty ? (
                <Typography variant="body2" color="text.secondary">
                  Start shopping to fill your cart. Items you add will appear here.
                </Typography>
              ) : (
                <Stack spacing={1.5} divider={<Divider flexItem sx={{ borderColor: 'divider' }} />}>
                  {cartItems.map((item) => {
                    const itemTotal = item.price * item.quantity;
                    return (
                      <Stack
                        key={item.id}
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                        justifyContent="space-between"
                      >
                        <Stack spacing={0.5}>
                          <Typography variant="subtitle1">{item.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.quantity} × {formatPrice(item.price)} = {formatPrice(itemTotal)}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <IconButton
                            aria-label={`Decrease quantity of ${item.name}`}
                            size="small"
                            onClick={() => handleDecreaseQuantity(item.id)}
                          >
                            <RemoveIcon fontSize="small" />
                          </IconButton>
                          <Typography variant="body2" minWidth={24} textAlign="center">
                            {item.quantity}
                          </Typography>
                          <IconButton
                            aria-label={`Increase quantity of ${item.name}`}
                            size="small"
                            onClick={() => handleIncreaseQuantity(item.id)}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            aria-label={`Remove ${item.name} from cart`}
                            size="small"
                            color="error"
                            onClick={() => handleRemoveFromCart(item.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              )}

              <Divider sx={{ borderColor: 'divider' }} />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1">Subtotal</Typography>
                  <Typography variant="subtitle1" color="secondary.main">
                    {formatPrice(cartSubtotal)}
                  </Typography>
                </Stack>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<ShoppingCartCheckoutIcon />}
                  onClick={handleOpenCheckout}
                  disabled={cartIsEmpty || checkoutLoading || !isOnline}
                >
                  {checkoutLoading ? 'Preparing checkout…' : 'Proceed to checkout'}
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {loading ? (
            <Paper
              variant="outlined"
              sx={{
                p: 4,
                borderStyle: 'dashed',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress color="secondary" size={32} />
              <Typography variant="body1">Loading catalogue…</Typography>
            </Paper>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : items.length === 0 ? (
            <Alert severity="info">No products are available yet. Please check back soon.</Alert>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  lg: 'repeat(3, minmax(0, 1fr))',
                },
              }}
            >
              {items.map((item) => {
                const outOfStock = item.availabilityCount <= 0;
                return (
                  <Card key={item.id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box
                      sx={{
                        width: '100%',
                        height: 200,
                        bgcolor: 'grey.900',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {item.url ? (
                        <Box
                          component="img"
                          src={item.url}
                          alt={item.name}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Image coming soon
                        </Typography>
                      )}
                    </Box>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
                      <Typography variant="overline" color="secondary.main">
                        {formatPrice(item.price)}
                      </Typography>
                      <Typography variant="h5" sx={{ mt: 1 }}>
                        {item.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.description || 'No description provided yet.'}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ px: 3, pb: 3, pt: 0, mt: 'auto' }}>
                      <Button
                        variant="contained"
                        color="secondary"
                        fullWidth
                        disabled={outOfStock}
                        onClick={() => handleAddToCart(item)}
                      >
                        {outOfStock ? 'Unavailable' : 'Add to cart'}
                      </Button>
                    </CardActions>
                  </Card>
                );
              })}
            </Box>
          )}
        </Stack>
      </Container>
      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!checkoutLoading) {
            setConfirmOpen(false);
            setShippingAddressError(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm checkout</DialogTitle>
        <DialogContent dividers>
          {cartIsEmpty ? (
            <Typography variant="body2" color="text.secondary">
              Your cart is empty.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body1">
                Please confirm the items you wish to purchase.
              </Typography>
              <Stack spacing={1.5} divider={<Divider flexItem sx={{ borderColor: 'divider' }} />}>
                {cartItems.map((item) => (
                  <Stack
                    key={item.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="body2">
                      {item.quantity} × {item.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatPrice(item.price * item.quantity)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1">Total</Typography>
                <Typography variant="subtitle1" color="secondary.main">
                  {formatPrice(cartSubtotal)}
                </Typography>
              </Stack>
              <Divider sx={{ borderColor: 'divider' }} />
              <Stack spacing={2}>
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Receipt email</Typography>
                  <TextField
                    type="email"
                    value={receiptEmail}
                    onChange={(event) => {
                      setReceiptEmail(event.target.value);
                      setReceiptEmailError(null);
                    }}
                    placeholder="Enter the email address to receive your receipt"
                    required
                    error={Boolean(receiptEmailError)}
                    helperText={receiptEmailError ?? 'We will send your order receipt to this email address.'}
                  />
                </Stack>
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Shipping address</Typography>
                  <TextField
                    multiline
                    minRows={3}
                    value={shippingAddress}
                    onChange={(event) => {
                      setShippingAddress(event.target.value);
                      setShippingAddressError(null);
                    }}
                    placeholder="Enter the delivery address for your order"
                    required
                    error={Boolean(shippingAddressError)}
                    helperText={
                      shippingAddressError ?? 'Provide your full delivery address, including unit and postal code.'
                    }
                  />
                </Stack>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={checkoutLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<ShoppingCartCheckoutIcon />}
            onClick={handleConfirmCheckout}
            disabled={checkoutLoading || cartIsEmpty || !isOnline}
          >
            {checkoutLoading ? 'Processing…' : 'Confirm and pay'}
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </>
  );
};

export default ShopPage;
