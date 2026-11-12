/*
 * g21-mice — MS-MICE (Miracast over Infrastructure) sink for MGU.
 *
 * Protocol flow follows [MS-MICE] + WFD RTSP M1–M7 as documented by
 * zitlem/AirShow (MiracastHandler) and homeworkc/lazycast. This file is
 * original C for the G21 head unit; it does not copy their source.
 *
 * Listens TCP 7250 for SOURCE_READY, dials the Windows source on RTSP
 * (usually 7236), then plays MPEG-TS/RTP on UDP 1028 via gst-launch and
 * the bundled waylandsink (same stack as UxPlay).
 */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define MICE_PORT 7250
#define DEFAULT_RTSP 7236
#define RTP_PORT 1028
#define STATUS_PATH "/run/g21-desktop.status"
#define LOG_PATH "/var/log/g21-mice.log"

static volatile sig_atomic_t g_stop;
static pid_t g_gst_pid;
static FILE *g_log;

static void on_signal(int sig)
{
    (void)sig;
    g_stop = 1;
}

static void note(const char *msg)
{
    if (!g_log) {
        g_log = fopen(LOG_PATH, "a");
    }
    if (g_log) {
        fprintf(g_log, "%s\n", msg);
        fflush(g_log);
    }
}

static void desk(const char *state, const char *detail)
{
    FILE *f = fopen(STATUS_PATH, "w");
    if (!f) {
        return;
    }
    fprintf(f, "%s|%s|\n", state, detail ? detail : "windows");
    fclose(f);
}

static int write_all(int fd, const char *buf, size_t len)
{
    size_t off = 0;
    while (off < len) {
        ssize_t n = write(fd, buf + off, len - off);
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            return -1;
        }
        off += (size_t)n;
    }
    return 0;
}

static int read_some(int fd, char *buf, size_t cap, size_t *have)
{
    ssize_t n;
    if (*have >= cap - 1) {
        return -1;
    }
    n = read(fd, buf + *have, cap - 1 - *have);
    if (n < 0) {
        if (errno == EINTR) {
            return 0;
        }
        return -1;
    }
    if (n == 0) {
        return -2;
    }
    *have += (size_t)n;
    buf[*have] = 0;
    return 1;
}

static void stop_gst(void)
{
    if (g_gst_pid > 0) {
        kill(g_gst_pid, SIGTERM);
        waitpid(g_gst_pid, NULL, 0);
        g_gst_pid = 0;
    }
}

static int start_gst(int port)
{
    char pipeline[640];
    char self[512];
    char dir[512];
    char launch[576];
    char runner[576];
    ssize_t n;
    char *slash;
    pid_t pid;
    stop_gst();
    snprintf(pipeline, sizeof(pipeline),
             "udpsrc port=%d caps=\"application/x-rtp,media=(string)video,encoding-name=(string)MP2T,clock-rate=(int)90000,payload=(int)33\" "
             "! rtpmp2tdepay ! tsdemux ! h264parse ! avdec_h264 ! videoconvert ! videoscale "
             "! video/x-raw,width=1920,height=720 ! waylandsink sync=false",
             port);
    dir[0] = 0;
    n = readlink("/proc/self/exe", self, sizeof(self) - 1);
    if (n > 0) {
        self[n] = 0;
        slash = strrchr(self, '/');
        if (slash) {
            *slash = 0;
            snprintf(dir, sizeof(dir), "%s", self);
        }
    }
    if (dir[0]) {
        snprintf(launch, sizeof(launch), "%s/gst-launch-1.0", dir);
        snprintf(runner, sizeof(runner), "%s/run-elf", dir);
    } else {
        snprintf(launch, sizeof(launch), "gst-launch-1.0");
        runner[0] = 0;
    }
    pid = fork();
    if (pid < 0) {
        return -1;
    }
    if (pid == 0) {
        if (runner[0] && access(runner, X_OK) == 0 && access(launch, X_OK) == 0) {
            execl(runner, "run-elf", launch, "-e", "-q", pipeline, (char *)NULL);
        }
        if (access(launch, X_OK) == 0) {
            execl(launch, "gst-launch-1.0", "-e", "-q", pipeline, (char *)NULL);
        }
        execlp("gst-launch-1.0", "gst-launch-1.0", "-e", "-q", pipeline, (char *)NULL);
        _exit(127);
    }
    g_gst_pid = pid;
    return 0;
}

struct source_ready {
    char name[128];
    char source_id[64];
    uint16_t rtsp_port;
};

static int parse_source_ready(const unsigned char *data, size_t len, struct source_ready *out)
{
    size_t pos;
    uint16_t msg_size;
    memset(out, 0, sizeof(*out));
    out->rtsp_port = DEFAULT_RTSP;
    if (len < 4) {
        return 0;
    }
    msg_size = (uint16_t)((data[0] << 8) | data[1]);
    if (data[3] != 0x01) {
        return 0;
    }
    if (msg_size > len) {
        msg_size = (uint16_t)len;
    }
    pos = 4;
    while (pos + 4 <= msg_size) {
        uint16_t tlv = (uint16_t)((data[pos] << 8) | data[pos + 1]);
        uint16_t tlen = (uint16_t)((data[pos + 2] << 8) | data[pos + 3]);
        pos += 4;
        if (pos + tlen > msg_size) {
            break;
        }
        if (tlv == 0x0001 && tlen >= 2) {
            /* UTF-16LE friendly name → ASCII-ish */
            size_t i;
            size_t o = 0;
            for (i = 0; i + 1 < tlen && o + 1 < sizeof(out->name); i += 2) {
                unsigned char lo = data[pos + i];
                if (lo >= 32 && lo < 127) {
                    out->name[o++] = (char)lo;
                }
            }
            out->name[o] = 0;
        } else if (tlv == 0x0002 && tlen >= 2) {
            out->rtsp_port = (uint16_t)((data[pos] << 8) | data[pos + 1]);
        } else if (tlv == 0x0003 && tlen > 0) {
            size_t n = tlen;
            if (n >= sizeof(out->source_id)) {
                n = sizeof(out->source_id) - 1;
            }
            memcpy(out->source_id, data + pos, n);
            out->source_id[n] = 0;
        }
        pos += tlen;
    }
    if (!out->name[0]) {
        strcpy(out->name, "Windows");
    }
    return 1;
}

static int tcp_listen(uint16_t port)
{
    int fd;
    int one = 1;
    struct sockaddr_in addr;
    fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(port);
    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        close(fd);
        return -1;
    }
    if (listen(fd, 1) != 0) {
        close(fd);
        return -1;
    }
    return fd;
}

static int tcp_connect_ip(struct in_addr ip, uint16_t port)
{
    int fd;
    struct sockaddr_in addr;
    fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr = ip;
    addr.sin_port = htons(port);
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        close(fd);
        return -1;
    }
    return fd;
}

static int rtsp_send(int fd, const char *msg)
{
    return write_all(fd, msg, strlen(msg));
}

static int rtsp_next(char *buf, size_t *have, char *out, size_t out_cap)
{
    char *end;
    char *cl;
    size_t header_len;
    size_t body_len = 0;
    size_t total;
    end = strstr(buf, "\r\n\r\n");
    if (!end) {
        return 0;
    }
    header_len = (size_t)(end - buf) + 4;
    cl = strcasestr(buf, "Content-Length:");
    if (cl && (size_t)(cl - buf) < header_len) {
        body_len = (size_t)atoi(cl + 15);
    }
    total = header_len + body_len;
    if (*have < total) {
        return 0;
    }
    if (total >= out_cap) {
        return -1;
    }
    memcpy(out, buf, total);
    out[total] = 0;
    memmove(buf, buf + total, *have - total);
    *have -= total;
    buf[*have] = 0;
    return 1;
}

static int header_cseq(const char *msg)
{
    const char *p = strcasestr(msg, "CSeq:");
    if (!p) {
        return 1;
    }
    return atoi(p + 5);
}

static int is_request(const char *msg, const char *method)
{
    return strncmp(msg, method, strlen(method)) == 0 && msg[strlen(method)] == ' ';
}

static int is_status_ok(const char *msg)
{
    return strncmp(msg, "RTSP/1.0 200", 12) == 0;
}

static const char *WFD_CAPS =
    "wfd_video_formats: 00 00 02 10 0001FEFF 3FFFFFFF 00000FFF 00 0000 0000 00 none none\r\n"
    "wfd_audio_codecs: LPCM 00000003 00, AAC 00000001 00\r\n"
    "wfd_client_rtp_ports: RTP/AVP/UDP;unicast 1028 0 mode=play\r\n"
    "wfd_content_protection: none\r\n"
    "wfd_display_edid: none\r\n"
    "wfd_connector_type: 05\r\n";

static int run_rtsp_session(struct in_addr peer, struct source_ready *src)
{
    int fd;
    char buf[8192];
    char msg[8192];
    size_t have = 0;
    int cseq_out = 1;
    int state = 1; /* 1=M1 .. 7=PLAY, 8=stream */
    char line[1024];
    char ipstr[64];

    inet_ntop(AF_INET, &peer, ipstr, sizeof(ipstr));
    fd = tcp_connect_ip(peer, src->rtsp_port ? src->rtsp_port : DEFAULT_RTSP);
    if (fd < 0) {
        note("rtsp-connect-fail");
        desk("error", "rtsp");
        return -1;
    }
    note("rtsp-connected");
    desk("starting", src->name);

    while (!g_stop && state < 8) {
        int got = read_some(fd, buf, sizeof(buf), &have);
        if (got < 0) {
            break;
        }
        while (rtsp_next(buf, &have, msg, sizeof(msg)) == 1) {
            int cseq = header_cseq(msg);
            if (state == 1 && is_request(msg, "OPTIONS")) {
                snprintf(line, sizeof(line),
                         "RTSP/1.0 200 OK\r\nCSeq: %d\r\n"
                         "Public: org.wfa.wfd1.0, GET_PARAMETER, SET_PARAMETER, SETUP, PLAY, PAUSE, TEARDOWN\r\n\r\n",
                         cseq);
                rtsp_send(fd, line);
                snprintf(line, sizeof(line),
                         "OPTIONS * RTSP/1.0\r\nCSeq: %d\r\nRequire: org.wfa.wfd1.0\r\n\r\n",
                         cseq_out++);
                rtsp_send(fd, line);
                state = 2;
            } else if (state == 2 && is_status_ok(msg)) {
                state = 3;
            } else if (state == 3 && is_request(msg, "GET_PARAMETER")) {
                snprintf(line, sizeof(line),
                         "RTSP/1.0 200 OK\r\nCSeq: %d\r\nContent-Type: text/parameters\r\n"
                         "Content-Length: %zu\r\n\r\n%s",
                         cseq, strlen(WFD_CAPS), WFD_CAPS);
                rtsp_send(fd, line);
                state = 4;
            } else if (state == 4 && is_request(msg, "SET_PARAMETER")) {
                snprintf(line, sizeof(line), "RTSP/1.0 200 OK\r\nCSeq: %d\r\n\r\n", cseq);
                rtsp_send(fd, line);
                state = 5;
            } else if (state == 5 && is_request(msg, "SET_PARAMETER")) {
                snprintf(line, sizeof(line), "RTSP/1.0 200 OK\r\nCSeq: %d\r\n\r\n", cseq);
                rtsp_send(fd, line);
                snprintf(line, sizeof(line),
                         "SETUP rtsp://%s:%u/wfd1.0/streamid=0 RTSP/1.0\r\n"
                         "CSeq: %d\r\nTransport: RTP/AVP/UDP;unicast;client_port=%d\r\n\r\n",
                         ipstr, (unsigned)(src->rtsp_port ? src->rtsp_port : DEFAULT_RTSP),
                         cseq_out++, RTP_PORT);
                rtsp_send(fd, line);
                start_gst(RTP_PORT);
                state = 6;
            } else if (state == 6 && is_status_ok(msg)) {
                snprintf(line, sizeof(line),
                         "PLAY rtsp://%s:%u/wfd1.0/streamid=0 RTSP/1.0\r\nCSeq: %d\r\n\r\n",
                         ipstr, (unsigned)(src->rtsp_port ? src->rtsp_port : DEFAULT_RTSP),
                         cseq_out++);
                rtsp_send(fd, line);
                state = 7;
            } else if (state == 7 && is_status_ok(msg)) {
                desk("running", src->name);
                note("streaming");
                state = 8;
            } else if (state >= 8 && is_request(msg, "GET_PARAMETER")) {
                snprintf(line, sizeof(line), "RTSP/1.0 200 OK\r\nCSeq: %d\r\n\r\n", cseq);
                rtsp_send(fd, line);
            } else if (is_request(msg, "TEARDOWN")) {
                snprintf(line, sizeof(line), "RTSP/1.0 200 OK\r\nCSeq: %d\r\n\r\n", cseq);
                rtsp_send(fd, line);
                g_stop = 1;
            }
        }
    }

    while (!g_stop && state == 8) {
        int got = read_some(fd, buf, sizeof(buf), &have);
        if (got == -2) {
            break;
        }
        if (got < 0) {
            break;
        }
        while (rtsp_next(buf, &have, msg, sizeof(msg)) == 1) {
            int cseq = header_cseq(msg);
            if (is_request(msg, "GET_PARAMETER")) {
                snprintf(line, sizeof(line), "RTSP/1.0 200 OK\r\nCSeq: %d\r\n\r\n", cseq);
                rtsp_send(fd, line);
            } else if (is_request(msg, "TEARDOWN")) {
                snprintf(line, sizeof(line), "RTSP/1.0 200 OK\r\nCSeq: %d\r\n\r\n", cseq);
                rtsp_send(fd, line);
                g_stop = 1;
            }
        }
        if (g_gst_pid > 0 && waitpid(g_gst_pid, NULL, WNOHANG) > 0) {
            g_gst_pid = 0;
            note("gst-exit");
            break;
        }
        usleep(50000);
    }

    stop_gst();
    close(fd);
    desk("idle", "windows");
    return 0;
}

int main(void)
{
    int listen_fd;
    signal(SIGTERM, on_signal);
    signal(SIGINT, on_signal);
    signal(SIGCHLD, SIG_IGN);
    note("g21-mice start");
    desk("waiting", "windows");
    listen_fd = tcp_listen(MICE_PORT);
    if (listen_fd < 0) {
        note("listen-fail");
        desk("missing", "mice-port");
        return 1;
    }
    while (!g_stop) {
        struct sockaddr_in peer;
        socklen_t plen = sizeof(peer);
        int cfd;
        unsigned char raw[2048];
        ssize_t n;
        struct source_ready src;
        fd_set rfds;
        struct timeval tv;
        FD_ZERO(&rfds);
        FD_SET(listen_fd, &rfds);
        tv.tv_sec = 1;
        tv.tv_usec = 0;
        if (select(listen_fd + 1, &rfds, NULL, NULL, &tv) <= 0) {
            continue;
        }
        cfd = accept(listen_fd, (struct sockaddr *)&peer, &plen);
        if (cfd < 0) {
            continue;
        }
        n = read(cfd, raw, sizeof(raw));
        if (n < 4 || !parse_source_ready(raw, (size_t)n, &src)) {
            note("bad-source-ready");
            close(cfd);
            continue;
        }
        close(cfd);
        note(src.name);
        g_stop = 0;
        run_rtsp_session(peer.sin_addr, &src);
        if (!g_stop) {
            desk("waiting", "windows");
        }
    }
    stop_gst();
    close(listen_fd);
    desk("idle", "stopped");
    note("g21-mice stop");
    return 0;
}
