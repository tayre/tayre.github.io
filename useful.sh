# -ss specifies start time, -t specifies duration
ffmpeg -ss 00:xx:yy \
    -i input.avi -vcodec libx264 \
    -t 00:00:zz output.mp4