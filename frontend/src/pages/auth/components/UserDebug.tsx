import { useEffect, useState } from "react";
import axios from "axios";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import RefreshIcon from "@mui/icons-material/Refresh";
import Signup from "./SignupForm";

const API: string = import.meta.env.VITE_BACKEND_API;

type UserData = {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
};

type StatusMessage = { severity: "success" | "error" | "info"; text: string };

// Provides admin-style utilities for inspecting mock users.
function UserDebug() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [showSignup, setShowSignup] = useState(false);
  const [pendingNames, setPendingNames] = useState<Record<string, string>>({});

  // Loads the list of users from the backend.
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get<UserData[]>(`${API}/api/users/`);
      setUsers(data);
      setStatus(null);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setStatus({ severity: "error", text: error.message });
      } else {
        setStatus({ severity: "error", text: "Unexpected error fetching users." });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers().catch(console.error);
  }, []);

  // Deletes a user account for testing.
  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${API}/api/users/${id}`);
      setUsers((prev) => prev.filter((user) => user.id !== id));
      setStatus({ severity: "success", text: "User deleted." });
    } catch (error) {
      console.error("Failed to delete user", error);
      setStatus({ severity: "error", text: "Delete failed." });
    }
  };

  // Updates a user's name field.
  const handleUpdate = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setStatus({ severity: "error", text: "Enter a name before updating." });
      return;
    }
    try {
      await axios.patch(`${API}/api/users/${id}`, {
        user_id: id,
        new_name: trimmed,
      });
      setStatus({ severity: "success", text: "User name updated." });
      await fetchUsers();
    } catch (error) {
      console.error("Failed to update user", error);
      setStatus({ severity: "error", text: "Failed to update user name." });
    }
  };

  if (showSignup) {
    return <Signup />;
  }

  return (
    <Box sx={{ py: 6 }}>
      <Card variant="outlined" sx={{ maxWidth: 960, mx: "auto" }}>
        <CardHeader
          title="User Debugger"
          subheader="Review, rename, or delete accounts in the system."
          action={
            <Stack direction="row" spacing={1}>
              <Button
                variant="text"
                startIcon={<ArrowBackIcon />}
                onClick={() => setShowSignup(true)}
              >
                Return
              </Button>
              <IconButton color="primary" onClick={() => fetchUsers().catch(console.error)}>
                <RefreshIcon />
              </IconButton>
            </Stack>
          }
        />
        <Divider />
        <CardContent>
          <Stack spacing={3}>
            {status ? <Alert severity={status.severity}>{status.text}</Alert> : null}

            {loading ? (
              <Stack alignItems="center" spacing={2} py={6}>
                <CircularProgress color="primary" />
                <Typography color="text.secondary">Loading users…</Typography>
              </Stack>
            ) : users.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                No users available.
              </Alert>
            ) : (
              <List>
                {users.map((user) => (
                  <ListItem
                    key={user.id}
                    alignItems="flex-start"
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 3,
                      mb: 2,
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar src={user.profileImageUrl ?? undefined}>
                        {user.profileImageUrl ? null : user.name?.[0]?.toUpperCase() ?? 'U'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={user.name || "Unnamed user"}
                      secondary={user.email}
                    />
                    <Stack spacing={1} sx={{ minWidth: 220 }}>
                      <TextField
                        label="Update name"
                        size="small"
                        value={pendingNames[user.id] ?? ""}
                        onChange={(event) =>
                          setPendingNames((prev) => ({ ...prev, [user.id]: event.target.value }))
                        }
                      />
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleUpdate(user.id, pendingNames[user.id] ?? "")}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          startIcon={<DeleteOutlineIcon />}
                          onClick={() => handleDelete(user.id)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default UserDebug;
