/*
 * FreeRDP 2 client for the head unit. It does not open a desktop of its own.
 * Software GDI only: this head unit's VA-API path is not assumed.
 * A certificate is accepted only when its fingerprint is already in
 * /run/g21-session/cert. Otherwise the fingerprint is reported and the
 * connection stops.
 */
#define _GNU_SOURCE
#include <fcntl.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winpr/crt.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

#include <freerdp/freerdp.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/input.h>
#ifndef PROXY_TYPE_SOCKS
#define PROXY_TYPE_SOCKS 2
#endif
#ifndef FreeRDP_ProxyType
#define FreeRDP_ProxyType 2015
#endif
#ifndef FreeRDP_ProxyHostname
#define FreeRDP_ProxyHostname 2016
#endif
#ifndef FreeRDP_ProxyPort
#define FreeRDP_ProxyPort 2017
#endif
#ifndef FreeRDP_ServerHostname
#define FreeRDP_ServerHostname 20
#endif
#ifndef FreeRDP_Username
#define FreeRDP_Username 21
#endif
#ifndef FreeRDP_Password
#define FreeRDP_Password 22
#endif

#define SOCKS5_PORT_FILE "/var/opt/iteriodev-tailscale/socks5-port"
#define SOCKS5_PORT_RUN "/run/g21-session/socks5-port"
#define SOCKS5_HOST "127.0.0.2"

#define TARGET "/run/g21-session/target"
#define SECRET "/run/g21-session/secret"
#define CERT "/run/g21-session/cert"
#define STATUS "/run/g21-desktop.status"
#define FRAME_SOCK "/run/g21-desktop/frame.sock"
#define INPUT_SOCK "/run/g21-desktop/input.sock"

static int frame_fd = -1;
static int input_listen = -1;
static int input_fd = -1;
static unsigned cursor_x = 0;
static unsigned cursor_y = 0;

static void status(const char *text)
{
    FILE *file = fopen(STATUS, "w");
    fprintf(stderr, "g21-rdp status %s\n", text ? text : "");
    fflush(stderr);
    if (!file) {
        return;
    }
    fputs(text, file);
    fputc('\n', file);
    fclose(file);
    chmod(STATUS, 0666);
}

static int read_text(const char *path, char *dst, size_t dst_len)
{
    FILE *file = fopen(path, "r");
    size_t n;
    if (!file) {
        return 0;
    }
    n = fread(dst, 1, dst_len - 1, file);
    fclose(file);
    dst[n] = 0;
    while (n > 0 && (dst[n - 1] == '\n' || dst[n - 1] == '\r')) {
        dst[--n] = 0;
    }
    return n > 0;
}

static int is_tailscale_ip(const char *host)
{
    unsigned a = 0;
    unsigned b = 0;
    unsigned c = 0;
    unsigned d = 0;
    if (sscanf(host, "%u.%u.%u.%u", &a, &b, &c, &d) != 4) {
        return 0;
    }
    if (a > 255 || b > 255 || c > 255 || d > 255) {
        return 0;
    }
    /* Tailscale CGNAT 100.64.0.0/10 — userspace tailscaled has no kernel route. */
    return a == 100 && b >= 64 && b <= 127;
}

static int read_socks5_port(void)
{
    char text[32];
    int port;
    const char *env = getenv("G21_SOCKS5_PORT");
    if (env && env[0]) {
        port = atoi(env);
        if (port > 0 && port <= 65535) {
            return port;
        }
    }
    if (read_text(SOCKS5_PORT_RUN, text, sizeof(text)) ||
        read_text(SOCKS5_PORT_FILE, text, sizeof(text))) {
        port = atoi(text);
        if (port > 0 && port <= 65535) {
            return port;
        }
    }
    return 0;
}

static void apply_tailscale_socks5(rdpSettings *settings, const char *host)
{
    int port;
    const char *socks_host;
    char *copy;
    if (!settings || !host || !is_tailscale_ip(host)) {
        return;
    }
    port = read_socks5_port();
    if (port <= 0) {
        fprintf(stderr, "g21-rdp: Tailscale host %s but no socks5-port\n", host);
        fflush(stderr);
        return;
    }
    socks_host = getenv("G21_SOCKS5_HOST");
    if (!socks_host || !socks_host[0]) {
        socks_host = SOCKS5_HOST;
    }
    /* Set both API and struct fields — FreeRDP 2.2 proxy path reads struct. */
    freerdp_settings_set_uint32(settings, FreeRDP_ProxyType, PROXY_TYPE_SOCKS);
    freerdp_settings_set_string(settings, FreeRDP_ProxyHostname, socks_host);
    freerdp_settings_set_uint16(settings, FreeRDP_ProxyPort, (UINT16)port);
    settings->ProxyType = PROXY_TYPE_SOCKS;
    settings->ProxyPort = (UINT16)port;
    if (!settings->ProxyHostname || strcmp(settings->ProxyHostname, socks_host) != 0) {
        copy = _strdup(socks_host);
        if (copy) {
            free(settings->ProxyHostname);
            settings->ProxyHostname = copy;
        }
    }
    fprintf(stderr, "g21-rdp: SOCKS5 %s:%d for %s\n", socks_host, port, host);
    fflush(stderr);
}

static DWORD verify_certificate(freerdp *instance, const char *host, UINT16 port,
    const char *common_name, const char *subject, const char *issuer,
    const char *fingerprint, DWORD flags)
{
    char trusted[160];
    char line[200];
    (void)instance;
    (void)host;
    (void)port;
    (void)common_name;
    (void)subject;
    (void)issuer;
    (void)flags;
    if (!fingerprint) {
        status("error|cert|");
        return 0;
    }
    if (read_text(CERT, trusted, sizeof(trusted)) && strcmp(trusted, fingerprint) == 0) {
        return 1;
    }
    snprintf(line, sizeof(line), "cert|%s|", fingerprint);
    status(line);
    return 0;
}

static void send_frame(rdpGdi *gdi)
{
    unsigned char header[8];
    unsigned int len;
    struct sockaddr_un addr;
    if (!gdi || !gdi->primary_buffer || gdi->width == 0 || gdi->height == 0) {
        return;
    }
    len = gdi->width * gdi->height * 4;
    if (frame_fd < 0) {
        frame_fd = socket(AF_UNIX, SOCK_STREAM, 0);
        if (frame_fd < 0) {
            return;
        }
        memset(&addr, 0, sizeof(addr));
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, FRAME_SOCK, sizeof(addr.sun_path) - 1);
        if (connect(frame_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
            close(frame_fd);
            frame_fd = -1;
            return;
        }
    }
    header[0] = gdi->width & 255;
    header[1] = (gdi->width >> 8) & 255;
    header[2] = gdi->height & 255;
    header[3] = (gdi->height >> 8) & 255;
    header[4] = len & 255;
    header[5] = (len >> 8) & 255;
    header[6] = (len >> 16) & 255;
    header[7] = (len >> 24) & 255;
    if (write(frame_fd, header, 8) != 8 || write(frame_fd, gdi->primary_buffer, len) != (ssize_t)len) {
        close(frame_fd);
        frame_fd = -1;
    }
}

static BOOL end_paint(rdpContext *context)
{
    send_frame(context->gdi);
    return TRUE;
}

static void open_input(void)
{
    struct sockaddr_un addr;
    unlink(INPUT_SOCK);
    input_listen = socket(AF_UNIX, SOCK_STREAM, 0);
    if (input_listen < 0) {
        return;
    }
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, INPUT_SOCK, sizeof(addr.sun_path) - 1);
    if (bind(input_listen, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        close(input_listen);
        input_listen = -1;
        return;
    }
    chmod(INPUT_SOCK, 0666);
    listen(input_listen, 1);
}

static void apply_line(freerdp *instance, const char *line)
{
    int x = 0;
    int y = 0;
    int button = 1;
    int down = 0;
    int delta = 0;
    UINT16 flags;
    if (sscanf(line, "M %d %d", &x, &y) == 2) {
        cursor_x = (unsigned)x;
        cursor_y = (unsigned)y;
        freerdp_input_send_mouse_event(instance->input, PTR_FLAGS_MOVE, (UINT16)x, (UINT16)y);
        return;
    }
    if (sscanf(line, "C %d %d", &button, &down) == 2) {
        flags = button == 3 ? PTR_FLAGS_BUTTON3 : PTR_FLAGS_BUTTON1;
        if (down) {
            flags |= PTR_FLAGS_DOWN;
        }
        freerdp_input_send_mouse_event(instance->input, flags, (UINT16)cursor_x, (UINT16)cursor_y);
        return;
    }
    if (sscanf(line, "W %d", &delta) == 1) {
        flags = PTR_FLAGS_WHEEL;
        if (delta < 0) {
            flags |= PTR_FLAGS_WHEEL_NEGATIVE;
            delta = -delta;
        }
        if (delta > 255) {
            delta = 255;
        }
        freerdp_input_send_mouse_event(instance->input, flags | (UINT16)delta, (UINT16)cursor_x, (UINT16)cursor_y);
    }
}

static void drain_input(freerdp *instance)
{
    char buffer[256];
    ssize_t n;
    if (input_listen >= 0 && input_fd < 0) {
        fd_set set;
        struct timeval none;
        FD_ZERO(&set);
        FD_SET(input_listen, &set);
        none.tv_sec = 0;
        none.tv_usec = 0;
        if (select(input_listen + 1, &set, NULL, NULL, &none) > 0) {
            input_fd = accept(input_listen, NULL, NULL);
            if (input_fd >= 0) {
                fcntl(input_fd, F_SETFL, O_NONBLOCK);
            }
        }
    }
    if (input_fd < 0) {
        return;
    }
    n = read(input_fd, buffer, sizeof(buffer) - 1);
    if (n <= 0) {
        if (n < 0 && errno == EAGAIN) {
            return;
        }
        close(input_fd);
        input_fd = -1;
        return;
    }
    buffer[n] = 0;
    {
        char *cursor = buffer;
        char *end;
        while ((end = strchr(cursor, '\n')) != NULL) {
            *end = 0;
            apply_line(instance, cursor);
            cursor = end + 1;
        }
        if (cursor[0]) {
            apply_line(instance, cursor);
        }
    }
}

static BOOL pre_connect(freerdp *instance)
{
    rdpSettings *settings = instance->settings;
    settings->OsMajorType = OSMAJORTYPE_UNIX;
    settings->ColorDepth = 32;
    settings->SoftwareGdi = TRUE;
    settings->NetworkAutoDetect = TRUE;
    settings->IgnoreCertificate = FALSE;
    settings->NlaSecurity = TRUE;
    settings->TlsSecurity = TRUE;
    settings->RdpSecurity = FALSE;
    if (instance->update) {
        instance->update->EndPaint = end_paint;
    }
    return TRUE;
}

static BOOL post_connect(freerdp *instance)
{
    if (!gdi_init(instance, PIXEL_FORMAT_BGRA32)) {
        status("error|gdi|");
        return FALSE;
    }
    status("connected|rdp|");
    return TRUE;
}

static void post_disconnect(freerdp *instance)
{
    gdi_free(instance);
    status("idle|rdp|");
}

int main(void)
{
    char target[300];
    char secret[200];
    char host[256];
    char user[80];
    int port = 3389;
    freerdp *instance;

    if (!read_text(TARGET, target, sizeof(target))) {
        status("error|no-host|");
        return 1;
    }
    user[0] = 0;
    host[0] = 0;
    if (sscanf(target, "%255s %d %79s", host, &port, user) < 2) {
        status("error|bad-target|");
        return 1;
    }
    secret[0] = 0;
    read_text(SECRET, secret, sizeof(secret));
    instance = freerdp_new();
    if (!instance) {
        status("error|freerdp|");
        return 1;
    }
    if (!freerdp_context_new(instance)) {
        status("error|freerdp|");
        freerdp_free(instance);
        return 1;
    }
    instance->PreConnect = pre_connect;
    instance->PostConnect = post_connect;
    instance->PostDisconnect = post_disconnect;
    instance->VerifyCertificateEx = verify_certificate;
    /* FreeRDP 2: ServerHostname/Username/Password are char* — strncpy(sizeof ptr) segfaults. */
    if (!freerdp_settings_set_string(instance->settings, FreeRDP_ServerHostname, host) ||
        !freerdp_settings_set_string(instance->settings, FreeRDP_Username, user) ||
        !freerdp_settings_set_string(instance->settings, FreeRDP_Password, secret)) {
        status("error|freerdp|");
        freerdp_free(instance);
        return 1;
    }
    if (!instance->settings->ServerHostname) {
        instance->settings->ServerHostname = _strdup(host);
    }
    if (user[0] && !instance->settings->Username) {
        instance->settings->Username = _strdup(user);
    }
    if (secret[0] && !instance->settings->Password) {
        instance->settings->Password = _strdup(secret);
    }
    instance->settings->ServerPort = (UINT32)port;
    instance->settings->DesktopWidth = 1920;
    instance->settings->DesktopHeight = 720;
    apply_tailscale_socks5(instance->settings, host);
    if (!instance->settings->ServerHostname || !instance->settings->ServerHostname[0]) {
        status("error|freerdp|");
        freerdp_free(instance);
        return 1;
    }
    memset(secret, 0, sizeof(secret));
    status("connecting|rdp|");
    open_input();
    fprintf(stderr, "g21-rdp: connect %s:%d user=%s proxy=%u\n",
        instance->settings->ServerHostname,
        (int)instance->settings->ServerPort,
        instance->settings->Username ? instance->settings->Username : "",
        (unsigned)instance->settings->ProxyType);
    fflush(stderr);
    if (!freerdp_connect(instance)) {
        fprintf(stderr, "g21-rdp: freerdp_connect failed err=0x%08X\n",
            (unsigned)freerdp_get_last_error(instance->context));
        fflush(stderr);
        status("error|connect|");
        freerdp_free(instance);
        return 1;
    }
    while (!freerdp_shall_disconnect(instance)) {
        void *rfds[32];
        int rcount = 0;
        int index;
        int max_fd = 0;
        fd_set set;
        struct timeval wait;
        if (!freerdp_get_fds(instance, rfds, &rcount, NULL, NULL)) {
            break;
        }
        FD_ZERO(&set);
        for (index = 0; index < rcount; index++) {
            int fd = (int)(intptr_t)rfds[index];
            FD_SET(fd, &set);
            if (fd > max_fd) {
                max_fd = fd;
            }
        }
        wait.tv_sec = 0;
        wait.tv_usec = 100000;
        select(max_fd + 1, &set, NULL, NULL, &wait);
        if (!freerdp_check_fds(instance)) {
            break;
        }
        drain_input(instance);
    }
    freerdp_disconnect(instance);
    freerdp_free(instance);
    return 0;
}
