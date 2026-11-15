/* LD_PRELOAD: pin UxPlay's IPv4 listen sockets to G21_BIND_IP.
 * The binary binds INADDR_ANY, so the same port is open on every NIC.
 * The iPhone hotspot can only reach wlan0.
 *
 * And room for the sound: every UDP socket UxPlay binds gets a 4 MiB receive buffer. With the system's 208 KiB
 * (about a second of AirPlay sound packets) the head unit, busy as it is, threw away half of the packets before
 * UxPlay read them (car, 2026-11-15: Udp RcvbufErrors 52178 against 53046 "resent audio packet" in UxPlay's log,
 * and 11 s of sound reaching the speakers in 29 s). Only UxPlay's own sockets: no setting of the system is touched. */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <dlfcn.h>
#include <errno.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>

#ifndef SO_RCVBUFFORCE
#define SO_RCVBUFFORCE 33
#endif

static void roomy(int sockfd)
{
    int type = 0, want = 4 * 1024 * 1024, got = 0;
    socklen_t len = sizeof(type);
    if (getsockopt(sockfd, SOL_SOCKET, SO_TYPE, &type, &len) != 0 || type != SOCK_DGRAM) return;
    /* (root may go past net.core.rmem_max; without that right, as much as the system gives) */
    if (setsockopt(sockfd, SOL_SOCKET, SO_RCVBUFFORCE, &want, sizeof(want)) != 0) setsockopt(sockfd, SOL_SOCKET, SO_RCVBUF, &want, sizeof(want));
    len = sizeof(got);
    if (getsockopt(sockfd, SOL_SOCKET, SO_RCVBUF, &got, &len) == 0) fprintf(stderr, "g21-bind: UDP socket %d receive buffer %d bytes\n", sockfd, got);
}

int bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen)
{
    static int (*real_bind)(int, const struct sockaddr *, socklen_t);
    struct sockaddr_in pinned;
    const char *ip;

    if (!real_bind) {
        real_bind = (int (*)(int, const struct sockaddr *, socklen_t))dlsym(RTLD_NEXT, "bind");
    }
    roomy(sockfd);
    ip = getenv("G21_BIND_IP");
    if (ip && *ip && addr && addr->sa_family == AF_INET && addrlen >= (socklen_t)sizeof(pinned)) {
        memcpy(&pinned, addr, sizeof(pinned));
        if (pinned.sin_addr.s_addr == htonl(INADDR_ANY) && inet_aton(ip, &pinned.sin_addr)) {
            return real_bind(sockfd, (struct sockaddr *)&pinned, sizeof(pinned));
        }
    }
    return real_bind(sockfd, addr, addrlen);
}
