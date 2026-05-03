from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, field_validator


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    requires_totp: bool = False
    partial_token: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class TotpVerifyRequest(BaseModel):
    partial_token: str
    code: str


class TotpEnableRequest(BaseModel):
    code: str


class TotpDisableRequest(BaseModel):
    password: str


class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str
    qr_svg: str
    recovery_codes: list[str] = []


class TotpStatusResponse(BaseModel):
    enabled: bool


class TotpRegenerateCodesResponse(BaseModel):
    recovery_codes: list[str]


# ── User ─────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    username: str
    email: EmailStr
    is_admin: bool = False
    is_active: bool = True


class UserCreate(UserBase):
    password: str
    group_ids: list[int] = []

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    group_ids: Optional[list[int]] = None


class UserOut(UserBase):
    id: int
    created_at: datetime
    group_ids: list[int] = []
    totp_enabled: bool = False
    language: str = "de"
    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    language: Optional[str] = None


# ── Group ────────────────────────────────────────────────────────────────────

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None


class GroupCreate(GroupBase):
    pass


class GroupOut(GroupBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Host ─────────────────────────────────────────────────────────────────────

class WebLinkIn(BaseModel):
    label: str = "Web"
    url: str
    sort_order: int = 0

class WebLinkOut(BaseModel):
    id: int
    label: str
    url: str
    sort_order: int
    model_config = {"from_attributes": True}


class HostBase(BaseModel):
    name: str
    hostname: str
    port: int = 22
    username: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    auth_method: Literal["password", "key", "none"] = "none"
    use_tmux: bool = False


class HostCreate(HostBase):
    password: Optional[str] = None
    ssh_key_id: Optional[int] = None
    group_ids: list[int] = []
    web_links: list[WebLinkIn] = []


class HostUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    auth_method: Optional[Literal["password", "key", "none"]] = None
    password: Optional[str] = None
    ssh_key_id: Optional[int] = None
    group_ids: Optional[list[int]] = None
    web_links: Optional[list[WebLinkIn]] = None
    use_tmux: Optional[bool] = None


class HostGroupInfo(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class HostOut(HostBase):
    id: int
    created_at: datetime
    group_ids: list[int] = []
    groups: list[HostGroupInfo] = []
    web_links: list[WebLinkOut] = []
    proxmox_source_name: Optional[str] = None
    proxmox_inactive: bool = False
    notes: Optional[str] = None
    use_tmux: bool = False
    model_config = {"from_attributes": True}


class ActiveSessionOut(BaseModel):
    id: int
    host_id: Optional[int]
    host_name: str
    host_hostname: Optional[str] = None
    user_id: Optional[int]
    username: str
    started_at: datetime
    tmux_name: str
    connected_clients: list[str] = []
    model_config = {"from_attributes": True}


# ── SSH Key ───────────────────────────────────────────────────────────────────

class SshKeyBase(BaseModel):
    name: str


class SshKeyCreate(SshKeyBase):
    public_key: str
    private_key: str
    passphrase: Optional[str] = None


class SshKeyOut(SshKeyBase):
    id: int
    fingerprint: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Session ──────────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id: int
    user_id: Optional[int]
    host_id: Optional[int]
    started_at: datetime
    ended_at: Optional[datetime]
    client_ip: Optional[str]
    session_type: str
    username: Optional[str] = None
    host_name: Optional[str] = None
    has_recording: bool = False
    tmux_name: Optional[str] = None
    model_config = {"from_attributes": True}


class SessionRecordingOut(BaseModel):
    session_id: int
    data: str
    model_config = {"from_attributes": True}


# ── Groups ───────────────────────────────────────────────────────────────────

class GroupMemberOut(BaseModel):
    user_id: int
    username: str
    role: str
    model_config = {"from_attributes": True}

class GroupHostOut(BaseModel):
    host_id: int
    name: str
    hostname: str
    model_config = {"from_attributes": True}

class GroupDetailOut(GroupBase):
    id: int
    created_at: datetime
    members: list[GroupMemberOut] = []
    hosts: list[GroupHostOut] = []
    model_config = {"from_attributes": True}

class AddUserToGroupRequest(BaseModel):
    user_id: int
    role: Literal["member", "admin"] = "member"

class AddHostToGroupRequest(BaseModel):
    host_id: int


# ── User Credentials ─────────────────────────────────────────────────────────

class UserGroupCredentialCreate(BaseModel):
    group_id: int
    username: Optional[str] = None
    auth_method: Literal["password", "key"] = "password"
    password: Optional[str] = None
    ssh_key_id: Optional[int] = None

class UserGroupCredentialOut(BaseModel):
    id: int
    group_id: int
    username: Optional[str]
    auth_method: str
    ssh_key_id: Optional[int]
    updated_at: datetime
    model_config = {"from_attributes": True}


class UserCredentialCreate(BaseModel):
    host_id: int
    username: Optional[str] = None
    auth_method: Literal["password", "key"] = "password"
    password: Optional[str] = None
    ssh_key_id: Optional[int] = None

class UserCredentialOut(BaseModel):
    id: int
    host_id: int
    username: Optional[str]
    auth_method: str
    ssh_key_id: Optional[int]
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Proxmox ──────────────────────────────────────────────────────────────────

class ProxmoxSourceCreate(BaseModel):
    name: str
    url: str
    api_token: str
    verify_ssl: bool = False
    import_qemu: bool = True
    import_lxc: bool = True
    only_running: bool = True
    label_filter: Optional[str] = None
    target_group_id: Optional[int] = None
    default_ssh_port: int = 22
    default_ssh_user: Optional[str] = None

class ProxmoxSourceUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    api_token: Optional[str] = None
    verify_ssl: Optional[bool] = None
    import_qemu: Optional[bool] = None
    import_lxc: Optional[bool] = None
    only_running: Optional[bool] = None
    label_filter: Optional[str] = None
    target_group_id: Optional[int] = None
    default_ssh_port: Optional[int] = None
    default_ssh_user: Optional[str] = None

class ProxmoxSourceOut(BaseModel):
    id: int
    name: str
    url: str
    verify_ssl: bool
    import_qemu: bool
    import_lxc: bool
    only_running: bool
    label_filter: Optional[str]
    target_group_id: Optional[int]
    default_ssh_port: int
    default_ssh_user: Optional[str]
    last_sync_at: Optional[datetime]
    last_sync_status: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}

class ProxmoxSyncResult(BaseModel):
    created: int
    updated: int
    deleted: int
    errors: list[str] = []


# ── Quick Commands ───────────────────────────────────────────────────────────

class QuickCommandCreate(BaseModel):
    label: str
    command: str
    hotkey: Optional[str] = None
    auto_enter: bool = True
    sort_order: int = 0

class QuickCommandUpdate(BaseModel):
    label: Optional[str] = None
    command: Optional[str] = None
    hotkey: Optional[str] = None
    auto_enter: Optional[bool] = None
    sort_order: Optional[int] = None

class QuickCommandOut(BaseModel):
    id: int
    label: str
    command: str
    hotkey: Optional[str] = None
    auto_enter: bool = True
    sort_order: int
    model_config = {"from_attributes": True}


# ── App Settings ─────────────────────────────────────────────────────────────

class AppSettingsOut(BaseModel):
    sync_interval_minutes: int
    model_config = {"from_attributes": True}

class AppSettingsUpdate(BaseModel):
    sync_interval_minutes: int


# ── SFTP ─────────────────────────────────────────────────────────────────────

class SftpEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int]
    modified: Optional[datetime]
    permissions: Optional[str]
    owner: Optional[str] = None
    group: Optional[str] = None
