FROM node:17-alpine
LABEL author="Wildboar Software"
LABEL app="meerkat"
# RUN /usr/local/bin/node -v
# RUN /usr/local/bin/npm -v
# RUN /usr/local/bin/npx -v
WORKDIR /srv/meerkat
COPY ./dist/apps/meerkat ./
RUN npm install --only=production --no-audit --no-fund --no-save
# We save the Prisma CLI at build time so we can perform migrations in this
# container without worrying about NPM outages.
RUN npm install --no-save prisma
RUN npx -q prisma generate
USER node
ENTRYPOINT ["/usr/local/bin/node", "/srv/meerkat/main.js"]
