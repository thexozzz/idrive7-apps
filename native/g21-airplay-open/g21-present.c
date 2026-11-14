#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

#include <gst/app/gstappsrc.h>
#include <gst/gst.h>

#define SOCK_PATH "/run/g21-desktop/frame.sock"

static void chmod_socket(void);

static int read_full(int fd, unsigned char *dst, size_t need)
{
    size_t got = 0;
    while (got < need) {
        ssize_t n = read(fd, dst + got, need - got);
        if (n == 0) {
            return 0;
        }
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            return -1;
        }
        got += (size_t)n;
    }
    return 1;
}

static int serve(GstElement *src)
{
    int listen_fd;
    struct sockaddr_un addr;
    int last_w = 0;
    int last_h = 0;

    unlink(SOCK_PATH);
    listen_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (listen_fd < 0) {
        return 1;
    }
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCK_PATH, sizeof(addr.sun_path) - 1);
    if (bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        return 1;
    }
    chmod_socket();
    if (listen(listen_fd, 1) != 0) {
        return 1;
    }
    for (;;) {
        int fd = accept(listen_fd, NULL, NULL);
        unsigned char header[8];
        if (fd < 0) {
            continue;
        }
        while (read_full(fd, header, 8) == 1) {
            unsigned int w = header[0] | (header[1] << 8);
            unsigned int h = header[2] | (header[3] << 8);
            unsigned int len = header[4] | (header[5] << 8) | (header[6] << 16) | (header[7] << 24);
            GstBuffer *buffer;
            GstMapInfo map;
            if (w == 0 || h == 0 || w > 4096 || h > 2160 || len != w * h * 4) {
                break;
            }
            buffer = gst_buffer_new_allocate(NULL, len, NULL);
            if (!buffer || !gst_buffer_map(buffer, &map, GST_MAP_WRITE)) {
                if (buffer) {
                    gst_buffer_unref(buffer);
                }
                break;
            }
            if (read_full(fd, map.data, len) != 1) {
                gst_buffer_unmap(buffer, &map);
                gst_buffer_unref(buffer);
                break;
            }
            gst_buffer_unmap(buffer, &map);
            if (w != (unsigned)last_w || h != (unsigned)last_h) {
                GstCaps *caps = gst_caps_new_simple("video/x-raw",
                    "format", G_TYPE_STRING, "BGRA",
                    "width", G_TYPE_INT, (int)w,
                    "height", G_TYPE_INT, (int)h,
                    "framerate", GST_TYPE_FRACTION, 0, 1,
                    NULL);
                gst_app_src_set_caps(GST_APP_SRC(src), caps);
                gst_caps_unref(caps);
                last_w = (int)w;
                last_h = (int)h;
            }
            if (gst_app_src_push_buffer(GST_APP_SRC(src), buffer) != GST_FLOW_OK) {
                break;
            }
        }
        close(fd);
    }
}

static void chmod_socket(void)
{
    chmod(SOCK_PATH, 0666);
}

int main(int argc, char **argv)
{
    GstElement *pipeline;
    GstElement *src;
    GError *error = NULL;

    gst_init(&argc, &argv);
    pipeline = gst_parse_launch(
        "appsrc name=src is-live=true format=time do-timestamp=true "
        "! queue max-size-buffers=1 leaky=downstream "
        "! videoconvert ! waylandsink",
        &error);
    if (!pipeline || error) {
        return 1;
    }
    src = gst_bin_get_by_name(GST_BIN(pipeline), "src");
    gst_element_set_state(pipeline, GST_STATE_PLAYING);
    serve(src);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(src);
    gst_object_unref(pipeline);
    return 0;
}
