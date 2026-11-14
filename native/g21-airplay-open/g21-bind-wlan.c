/* LD_PRELOAD: pin UxPlay's IPv4 listen sockets to G21_BIND_IP.
 * The binary binds INADDR_ANY, so the same port is open on every NIC.
 * The iPhone hotspot can only reach wlan0. */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <dlfcn.h>
#include <errno.h>
#include <netinet/in.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>

int bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen)
{
    static int (*real_bind)(int, const struct sockaddr *, socklen_t);
    struct sockaddr_in pinned;
    const char *ip;

    if (!real_bind) {
        real_bind = (int (*)(int, const struct sockaddr *, socklen_t))dlsym(RTLD_NEXT, "bind");
    }
    ip = getenv("G21_BIND_IP");
    if (ip && *ip && addr && addr->sa_family == AF_INET && addrlen >= (socklen_t)sizeof(pinned)) {
        memcpy(&pinned, addr, sizeof(pinned));
        if (pinned.sin_addr.s_addr == htonl(INADDR_ANY) && inet_aton(ip, &pinned.sin_addr)) {
            return real_bind(sockfd, (struct sockaddr *)&pinned, sizeof(pinned));
        }
    }
    return real_bind(sockfd, addr, addrlen);
}
