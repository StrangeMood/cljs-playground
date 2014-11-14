(ns helloajax
  (:require [reagent.core :as reagent :refer [atom]]
            [ajax.core :refer [POST]]))

(def greeter (atom "you need to make a greeter"))

(defn get-greeter [el]
  (POST "/hello_ajax/greet" {:params (js/FormData. el)}))

(defn name-form []
  [:form [:p "Please enter your name and hit the button: "
          [:input {:type "text" :value "" :name "name"}]
          [:button {:on-click #(get-greeter (.getElementsBytagName js/document "form"))}]]])

(defn main-component []
  [:div
   [name-form]
   [:h2 @greeter]])


(defn ^:export run []
  (reagent/render-component
    [main-component]
    (.getElementById js/document "hello-ajax-container")))