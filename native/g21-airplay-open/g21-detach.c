/* Tiny launcher: new session (setsid syscall) then exec.
 * BusyBox on this MGU has no setsid applet; libc setsid still works. */
#define _GNU_SOURCE
#include <errno.h>
#include <stdio.h>
#include <unistd.h>

int main(int argc, char **argv)
{
    if (argc < 2) {
        fprintf(stderr, "usage: g21-detach <cmd> [args...]\n");
        return 127;
    }
    if (setsid() < 0 && errno != EPERM) {
        /* Keep going: still better to start UxPlay than abort. */
    }
    execvp(argv[1], argv + 1);
    fprintf(stderr, "g21-detach: exec %s: %d\n", argv[1], errno);
    return 127;
}
