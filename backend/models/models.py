from datetime import datetime
from sqlalchemy import (
    Integer, String, Boolean, DateTime, Text,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_recovery_codes: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of SHA-256 hashed codes
    language: Mapped[str] = mapped_column(String(5), default="de")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user_groups: Mapped[list["UserGroup"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    ssh_keys: Mapped[list["SshKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list["Session"]] = relationship(back_populates="user")
    quick_commands: Mapped[list["QuickCommand"]] = relationship(back_populates="user", cascade="all, delete-orphan", order_by="QuickCommand.sort_order")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user_groups: Mapped[list["UserGroup"]] = relationship(back_populates="group", cascade="all, delete-orphan")
    host_groups: Mapped[list["HostGroup"]] = relationship(back_populates="group", cascade="all, delete-orphan")


class UserGroup(Base):
    __tablename__ = "user_groups"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(SAEnum("member", "admin"), default="member")

    user: Mapped["User"] = relationship(back_populates="user_groups")
    group: Mapped["Group"] = relationship(back_populates="user_groups")


class ProxmoxSource(Base):
    __tablename__ = "proxmox_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    url: Mapped[str] = mapped_column(String(255), nullable=False)
    api_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    verify_ssl: Mapped[bool] = mapped_column(Boolean, default=False)
    import_qemu: Mapped[bool] = mapped_column(Boolean, default=True)
    import_lxc: Mapped[bool] = mapped_column(Boolean, default=True)
    only_running: Mapped[bool] = mapped_column(Boolean, default=True)
    label_filter: Mapped[str | None] = mapped_column(String(128), nullable=True)
    target_group_id: Mapped[int | None] = mapped_column(ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)
    default_ssh_port: Mapped[int] = mapped_column(Integer, default=22)
    default_ssh_user: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_status: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    target_group: Mapped["Group | None"] = relationship(foreign_keys=[target_group_id])


class Host(Base):
    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=22)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_method: Mapped[str] = mapped_column(SAEnum("password", "key", "none"), default="none")
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    use_tmux: Mapped[bool] = mapped_column(Boolean, default=False)
    proxmox_source_id: Mapped[int | None] = mapped_column(ForeignKey("proxmox_sources.id", ondelete="SET NULL"), nullable=True)
    proxmox_vmid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proxmox_inactive: Mapped[bool] = mapped_column(Boolean, default=False)
    proxmox_source: Mapped["ProxmoxSource | None"] = relationship(foreign_keys=[proxmox_source_id])
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    host_groups: Mapped[list["HostGroup"]] = relationship(back_populates="host", cascade="all, delete-orphan")
    host_keys: Mapped[list["HostKey"]] = relationship(back_populates="host", cascade="all, delete-orphan")
    web_links: Mapped[list["HostWebLink"]] = relationship(back_populates="host", cascade="all, delete-orphan", order_by="HostWebLink.sort_order")
    sessions: Mapped[list["Session"]] = relationship(back_populates="host")


class HostWebLink(Base):
    __tablename__ = "host_web_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(64), default="Web")
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    host: Mapped["Host"] = relationship(back_populates="web_links")


class HostGroup(Base):
    __tablename__ = "host_groups"

    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"), primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)

    host: Mapped["Host"] = relationship(back_populates="host_groups")
    group: Mapped["Group"] = relationship(back_populates="host_groups")


class SshKey(Base):
    __tablename__ = "ssh_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    private_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    passphrase_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    fingerprint: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="ssh_keys")
    host_keys: Mapped[list["HostKey"]] = relationship(back_populates="ssh_key", cascade="all, delete-orphan")


class HostKey(Base):
    __tablename__ = "host_keys"

    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"), primary_key=True)
    ssh_key_id: Mapped[int] = mapped_column(ForeignKey("ssh_keys.id", ondelete="CASCADE"), primary_key=True)

    host: Mapped["Host"] = relationship(back_populates="host_keys")
    ssh_key: Mapped["SshKey"] = relationship(back_populates="host_keys")


class KnownHost(Base):
    """SSH host key verification (known_hosts)."""
    __tablename__ = "known_hosts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"))
    key_type: Mapped[str] = mapped_column(String(64))
    fingerprint: Mapped[str] = mapped_column(String(255), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserGroupCredential(Base):
    """Per-user credentials for an entire group (inherited by all hosts in the group)."""
    __tablename__ = "user_group_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"))
    username: Mapped[str | None] = mapped_column(String(64))
    auth_method: Mapped[str] = mapped_column(SAEnum("password", "key"), default="password")
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    ssh_key_id: Mapped[int | None] = mapped_column(ForeignKey("ssh_keys.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserCredential(Base):
    """Per-user credentials for a host (override host shared credentials)."""
    __tablename__ = "user_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"))
    username: Mapped[str | None] = mapped_column(String(64))
    auth_method: Mapped[str] = mapped_column(SAEnum("password", "key"), default="password")
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    ssh_key_id: Mapped[int | None] = mapped_column(ForeignKey("ssh_keys.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id", ondelete="SET NULL"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    client_ip: Mapped[str | None] = mapped_column(String(64))
    session_type: Mapped[str] = mapped_column(SAEnum("ssh", "sftp"), default="ssh")
    tmux_name: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")
    host: Mapped["Host"] = relationship(back_populates="sessions")
    recording: Mapped["SessionRecording | None"] = relationship(back_populates="session", uselist=False, cascade="all, delete-orphan")


class SessionRecording(Base):
    __tablename__ = "session_recordings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), unique=True)
    data: Mapped[str] = mapped_column(LONGTEXT)  # JSON: [[offset_seconds, output_string], ...]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="recording")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    sync_interval_minutes: Mapped[int] = mapped_column(Integer, default=360)


class AuthSession(Base):
    """Login session backing the httpOnly session cookie (replaces JWT)."""
    __tablename__ = "auth_sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class TotpPending(Base):
    """Short-lived token issued after password check, before TOTP verification."""
    __tablename__ = "totp_pending"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class QuickCommand(Base):
    __tablename__ = "quick_commands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    command: Mapped[str] = mapped_column(String(1024), nullable=False)
    hotkey: Mapped[str | None] = mapped_column(String(8), nullable=True)
    auto_enter: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="quick_commands")
